import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { storeSourceFileInConvex } from "@/lib/convex-source-file.server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import { createExtractionJob, updateExtractionJob } from "@/lib/extraction-job-store.server";
import { parseExtractionMode } from "@/lib/extraction-config";
import { sha256FileBytes } from "@/lib/file-hash.server";
import { getOpenRouterModel } from "@/lib/openrouter-client";
import {
  estimateExtractionCostUsd,
  estimateUploadExtractionBatchCount,
  reserveCostUsd,
} from "@/lib/plan-limits.server";
import { runPdfMcqExtraction } from "@/lib/pdf-extraction.server";
import { getQuotaSubjectDetails } from "@/lib/request-user.server";
import { getPdfPageCountForUpload } from "@/lib/pdfjs-server.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";
import { preflightTrackedAiCall } from "@/lib/tracked-openrouter.server";
import {
  getUnsupportedUploadReason,
  inferUploadMimeType,
  isSupportedUploadFile,
} from "@/lib/upload-file-types";
import { sanitizeUserFacingError } from "@/lib/user-facing-error.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const rateLimited = await enforceApiRateLimit(request, "pdfExtract");
  if (rateLimited) return rateLimited;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Upload a supported file." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Upload a supported file." }, { status: 400 });
  }
  const requestedFileName = formData.get("fileName");
  const displayFileName =
    typeof requestedFileName === "string" && requestedFileName.trim()
      ? requestedFileName.trim()
      : file.name;

  if (!isSupportedUploadFile(file)) {
    return Response.json(
      {
        error:
          getUnsupportedUploadReason(file) ??
          "Unsupported file type. Upload a PDF, image, text, markdown, or RTF file.",
        failureReason: "unsupported_file_type",
      },
      { status: 400 },
    );
  }

  const serverUploadLimit = getServerUploadByteLimit();
  if (file.size > serverUploadLimit) {
    return Response.json(
      { error: "File is too large for this server." },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileHash = await sha256FileBytes(arrayBuffer);
  const mimeType = inferUploadMimeType(file);
  const extractionMode = parseExtractionMode(formData.get("extractionMode"));
  const pageCount = await getPageCountForUpload(file, arrayBuffer, mimeType);
  const quotaSubject = await getQuotaSubjectDetails(request);
  const clerkUserId = quotaSubject.clerkUserId;
  const model = getOpenRouterModel("OPENROUTER_EXTRACTION_MODEL");
  const estimatedCostUsd = reserveCostUsd(
    estimateExtractionCostUsd({
      pageCount,
      batchCount: estimateUploadExtractionBatchCount(pageCount),
      model,
    }),
  );

  const preflight = await preflightTrackedAiCall({
    clerkUserId,
    email: quotaSubject.email,
    feature: "extract",
    estimatedCostUsd,
    estimatedPages: pageCount,
    fileSizeBytes: file.size,
    fileHash,
    model,
    reserve: false,
  });

  if (!preflight.allowed) {
    return Response.json(
      {
        error: preflight.reason ?? "Usage quota exceeded.",
        failureReason: "quota_exceeded",
        hint: "Subscribe at /pricing to extract questions from your files.",
      },
      { status: 402 },
    );
  }

  const jobId = randomUUID();

  await createExtractionJob({
    jobId,
    fileHash,
    fileName: displayFileName,
    mimeType,
    extractionMode,
    extractionModel: model,
    totalPages: pageCount,
    clerkUserId,
  });

  void storeSourceFileInConvex({
    clerkUserId,
    ownerEmail: quotaSubject.email,
    fileHash,
    fileName: displayFileName,
    mimeType,
    arrayBuffer,
  });

  try {
    after(async () => {
      try {
        await runPdfMcqExtraction({
          apiKey,
          fileName: displayFileName,
          mimeType,
          arrayBuffer,
          fileSizeBytes: file.size,
          extractionMode,
          fileHash,
          pageCount,
          clerkUserId,
          email: quotaSubject.email,
          jobId,
        });
      } catch (error) {
        await updateExtractionJob(jobId, {
          status: "failed",
          failureReason: "unknown_transient_error",
          error: sanitizeUserFacingError(
            error instanceof Error ? error.message : undefined,
          ),
        });
      }
    });

    return Response.json(
      {
        jobId,
        status: "queued",
        fileHash,
        fileName: displayFileName,
        pageCount,
      },
      { status: 202 },
    );
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
    throw error;
  }
}

const DEFAULT_SERVER_UPLOAD_BYTES = 500 * 1024 * 1024;

function getServerUploadByteLimit() {
  const raw = process.env.MAX_SERVER_UPLOAD_BYTES;
  if (!raw) return DEFAULT_SERVER_UPLOAD_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SERVER_UPLOAD_BYTES;
}

async function getPageCountForUpload(
  file: File,
  arrayBuffer: ArrayBuffer,
  mimeType: string,
): Promise<number> {
  if (mimeType.startsWith("image/")) return 1;

  const isPdf =
    mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return 1;

  try {
    return await getPdfPageCountForUpload(arrayBuffer);
  } catch {
    return 1;
  }
}
