import { randomUUID } from "node:crypto";
import { storeSourceFileInConvex } from "@/lib/convex-source-file.server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import {
  createExtractionJob,
  getActiveExtractionJobForUpload,
} from "@/lib/extraction-job-store.server";
import { parseExtractionMode } from "@/lib/extraction-config";
import { sha256FileBytes } from "@/lib/file-hash.server";
import { getMistralOcrModel } from "@/lib/mistral-ocr.server";
import { estimateOcrCostUsd, reserveCostUsd } from "@/lib/plan-limits.server";
import { getQuotaSubjectDetails } from "@/lib/request-user.server";
import { getPdfPageCountForUpload } from "@/lib/pdfjs-server.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";
import {
  createServerTiming,
  logPerformanceEvent,
} from "@/lib/server-timing.server";
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
  const timing = createServerTiming();
  try {
    return await queueExtractionUpload(request, timing);
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) {
      Object.entries(timing.headers()).forEach(([key, value]) => {
        configError.headers.set(key, value);
      });
      return configError;
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[upload] extraction upload failed", error);
    }

    return jsonWithTiming(
      timing,
      {
        error: sanitizeUserFacingError(
          error instanceof Error ? error.message : undefined,
        ),
        failureReason: "upload_server_error",
      },
      { status: 500 },
    );
  }
}

async function queueExtractionUpload(
  request: Request,
  timing: ReturnType<typeof createServerTiming>,
) {
  const rateLimited = await enforceApiRateLimit(request, "pdfExtract");
  if (rateLimited) return rateLimited;

  const formData = await timing.measure("form_parse", () =>
    request.formData().catch(() => null),
  );
  if (!formData) {
    return jsonWithTiming(
      timing,
      { error: "Upload a supported file." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonWithTiming(
      timing,
      { error: "Upload a supported file." },
      { status: 400 },
    );
  }
  const requestedFileName = formData.get("fileName");
  const displayFileName =
    typeof requestedFileName === "string" && requestedFileName.trim()
      ? requestedFileName.trim()
      : file.name;

  if (!isSupportedUploadFile(file)) {
    return jsonWithTiming(
      timing,
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
    return jsonWithTiming(
      timing,
      { error: "File is too large for this server." },
      { status: 413 },
    );
  }

  const arrayBuffer = await timing.measure("file_buffer", () => file.arrayBuffer());
  const fileHash = await timing.measure("file_hash", () =>
    sha256FileBytes(arrayBuffer),
  );
  const mimeType = inferUploadMimeType(file);
  const extractionMode = parseExtractionMode(formData.get("extractionMode"));
  const pageCount = await timing.measure("page_count", () =>
    getPageCountForUpload(file, arrayBuffer, mimeType),
  );
  const quotaSubject = await getQuotaSubjectDetails(request);
  const clerkUserId = quotaSubject.clerkUserId;
  const model = getMistralOcrModel();
  const estimatedCostUsd = reserveCostUsd(
    Math.max(1, pageCount) * estimateOcrCostUsd(),
  );

  const preflight = await timing.measure("quota_preflight", () =>
    preflightTrackedAiCall({
      clerkUserId,
      email: quotaSubject.email,
      feature: "extract",
      estimatedCostUsd,
      estimatedPages: pageCount,
      fileSizeBytes: file.size,
      fileHash,
      model,
      reserve: false,
    }),
  );

  if (!preflight.allowed) {
    return jsonWithTiming(
      timing,
      {
        error: preflight.reason ?? "Usage quota exceeded.",
        failureReason: "quota_exceeded",
        hint: "Subscribe at /pricing to extract questions from your files.",
      },
      { status: 402 },
    );
  }

  const jobId = randomUUID();
  const activeJob = await timing.measure("active_job_lookup", () =>
    getActiveExtractionJobForUpload({
      fileHash,
      extractionMode,
      extractionModel: model,
      clerkUserId,
    }).catch((error) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload] active job lookup failed", error);
      }
      return null;
    }),
  );

  if (activeJob) {
    return jsonWithTiming(
      timing,
      {
        jobId: activeJob.jobId,
        status: activeJob.status,
        fileHash: activeJob.fileHash,
        fileName: activeJob.fileName ?? displayFileName,
        pageCount: activeJob.totalPages || pageCount,
        inFlightHit: true,
      },
      { status: 202 },
    );
  }

  const sourceStored = await timing.measure("source_store", () =>
    storeSourceFileInConvex({
      clerkUserId,
      ownerEmail: quotaSubject.email,
      fileHash,
      fileName: displayFileName,
      mimeType,
      arrayBuffer,
    }),
  );

  if (!sourceStored) {
    return jsonWithTiming(
      timing,
      {
        error:
          "Could not persist the original file for durable extraction. Sign in and try again with a smaller file.",
        failureReason: "source_file_missing",
      },
      { status: clerkUserId?.startsWith("anon:") ? 401 : 503 },
    );
  }

  await timing.measure("job_create", () =>
    createExtractionJob({
      jobId,
      fileHash,
      fileName: displayFileName,
      mimeType,
      extractionMode,
      extractionModel: model,
      totalPages: pageCount,
      clerkUserId,
    }),
  );

  try {
    void triggerExtractionWorker(request).catch((error) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload] extraction worker trigger failed", error);
      }
    });

    logPerformanceEvent("upload_queued", {
      fileSizeBytes: file.size,
      pageCount,
      mimeType,
      extractionMode,
      model,
      status: "queued",
      ...timing.summary(),
    });

    return jsonWithTiming(
      timing,
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

async function triggerExtractionWorker(request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.EXTRACTION_STORAGE_SECRET;
  if (!secret) return;

  await fetch(new URL("/api/pdf/mcqs/worker", request.url), {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${secret}`,
    },
  });
}

function jsonWithTiming(
  timing: ReturnType<typeof createServerTiming>,
  body: Parameters<typeof Response.json>[0],
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  Object.entries(timing.headers()).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return Response.json(body, { ...init, headers });
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
