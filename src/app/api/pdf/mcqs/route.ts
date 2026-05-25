import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { storeSourceFileInConvex } from "@/lib/convex-source-file.server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import { createExtractionJob, updateExtractionJob } from "@/lib/extraction-job-store.server";
import { parseExtractionMode } from "@/lib/extraction-config";
import { sha256FileBytes } from "@/lib/file-hash.server";
import { runPdfMcqExtraction } from "@/lib/pdf-extraction.server";
import { getQuotaSubject } from "@/lib/request-user.server";
import { getPdfPageCountForUpload } from "@/lib/pdfjs-server.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";
import {
  getUnsupportedUploadReason,
  inferUploadMimeType,
  isSupportedUploadFile,
} from "@/lib/upload-file-types";

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
  const clerkUserId = await getQuotaSubject(request);
  const jobId = randomUUID();

  await createExtractionJob({
    jobId,
    fileHash,
    totalPages: pageCount,
    clerkUserId,
  });

  void storeSourceFileInConvex({
    clerkUserId,
    fileHash,
    fileName: file.name,
    mimeType,
    arrayBuffer,
  });

  try {
    after(async () => {
      try {
        await runPdfMcqExtraction({
          apiKey,
          fileName: file.name,
          mimeType,
          arrayBuffer,
          fileSizeBytes: file.size,
          extractionMode,
          fileHash,
          pageCount,
          clerkUserId,
          jobId,
        });
      } catch (error) {
        await updateExtractionJob(jobId, {
          status: "failed",
          failureReason: "unknown_transient_error",
          error:
            error instanceof Error
              ? error.message
              : "Extraction failed temporarily. Please try again.",
        });
      }
    });

    return Response.json(
      {
        jobId,
        status: "queued",
        fileHash,
        fileName: file.name,
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
