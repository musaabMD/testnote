import { randomUUID } from "node:crypto";
import { after } from "next/server";
import {
  getConvexSourceFileUrl,
  storeSourceFileInConvex,
} from "@/lib/convex-source-file.server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import {
  claimQueuedExtractionJobForUpload,
  createExtractionJob,
} from "@/lib/extraction-job-store.server";
import {
  buildExtractionCacheKey,
  extractionCacheKeyId,
  parseExtractionMode,
} from "@/lib/extraction-config";
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
  getUnsupportedUploadReasonForNameAndMime,
  inferUploadMimeType,
  inferUploadMimeTypeFromName,
} from "@/lib/upload-file-types";
import { logUploadPipeline } from "@/lib/upload-pipeline-trace";
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

  const upload = await timing.measure("upload_parse", () =>
    parseExtractionUploadRequest(request),
  );
  if (!upload) {
    return jsonWithTiming(
      timing,
      { error: "Upload a supported file." },
      { status: 400 },
    );
  }
  logUploadPipeline(upload.uploadTraceId, "request_received", {
    contentType: request.headers.get("content-type"),
  });
  logUploadPipeline(upload.uploadTraceId, "file_parsed", {
    fileName: upload.displayFileName,
    fileSizeBytes: upload.fileSizeBytes,
    mimeType: upload.mimeType,
    sourceAlreadyStored: upload.sourceAlreadyStored,
  });

  if (upload.unsupportedReason) {
    logUploadPipeline(upload.uploadTraceId, "response_400", {
      failureReason: "unsupported_file_type",
    });
    return jsonWithTiming(
      timing,
      {
        error: upload.unsupportedReason,
        failureReason: "unsupported_file_type",
      },
      { status: 400 },
    );
  }

  const serverUploadLimit = getServerUploadByteLimit();
  if (upload.fileSizeBytes > serverUploadLimit) {
    logUploadPipeline(upload.uploadTraceId, "response_413", {
      fileSizeBytes: upload.fileSizeBytes,
      serverUploadLimit,
    });
    return jsonWithTiming(
      timing,
      { error: "File is too large for this server." },
      { status: 413 },
    );
  }

  const arrayBuffer =
    upload.file && !upload.fileHash
      ? await timing.measure("file_buffer", () => upload.file!.arrayBuffer())
      : upload.arrayBuffer;
  const fileHash =
    upload.fileHash ??
    (arrayBuffer
      ? await timing.measure("file_hash", () => sha256FileBytes(arrayBuffer))
      : null);
  if (!fileHash) {
    logUploadPipeline(upload.uploadTraceId, "response_400", {
      failureReason: "missing_file_hash",
    });
    return jsonWithTiming(
      timing,
      { error: "Upload metadata is missing a file id." },
      { status: 400 },
    );
  }

  const pageCount =
    upload.pageCount ??
    (upload.file && arrayBuffer
      ? await timing.measure("page_count", () =>
          getPageCountForUpload(upload.file!, arrayBuffer, upload.mimeType),
        )
      : 1);
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
      fileSizeBytes: upload.fileSizeBytes,
      fileHash,
      model,
      reserve: false,
    }),
  );
  logUploadPipeline(upload.uploadTraceId, "quota_checked", {
    allowed: preflight.allowed,
    failureReason: preflight.allowed ? undefined : "quota_exceeded",
    pageCount,
    estimatedCostUsd,
  });

  if (!preflight.allowed) {
    logUploadPipeline(upload.uploadTraceId, "response_402", {
      fileHash,
      failureReason: "quota_exceeded",
    });
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

  const sourcePersistStartedAt = Date.now();
  logUploadPipeline(upload.uploadTraceId, "source_persist_start", {
    fileHash,
    sourceAlreadyStored: upload.sourceAlreadyStored,
  });
  const sourceStored = await timing.measure("source_store", async () => {
    if (upload.sourceAlreadyStored) {
      if (!clerkUserId || clerkUserId.startsWith("anon:")) return false;
      const source = await getConvexSourceFileUrl({ clerkUserId, fileHash });
      return Boolean(source?.url);
    }

    if (!arrayBuffer) return false;
    return storeSourceFileInConvex({
      clerkUserId,
      ownerEmail: quotaSubject.email,
      fileHash,
      fileName: upload.displayFileName,
      mimeType: upload.mimeType,
      arrayBuffer,
    });
  });
  const sourcePersistedAt = sourceStored ? Date.now() : undefined;
  logUploadPipeline(upload.uploadTraceId, "source_persist_done", {
    fileHash,
    sourceStored,
  });

  if (!sourceStored) {
    logUploadPipeline(upload.uploadTraceId, "response_source_missing", {
      fileHash,
      status: clerkUserId?.startsWith("anon:") ? 401 : 503,
    });
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

  const jobId = randomUUID();
  const extractionKey = extractionCacheKeyId(
    buildExtractionCacheKey(fileHash, upload.extractionMode, model),
  );
  const queuedAt = Date.now();
  logUploadPipeline(upload.uploadTraceId, "job_claim_start", {
    jobId,
    fileHash,
    extractionKey,
  });
  const queuedClaim = await timing.measure("job_claim", () =>
    claimQueuedExtractionJobForUpload({
      jobId,
      extractionKey,
      uploadTraceId: upload.uploadTraceId,
      fileHash,
      fileName: upload.displayFileName,
      mimeType: upload.mimeType,
      extractionMode: upload.extractionMode,
      extractionModel: model,
      totalPages: pageCount,
      clerkUserId,
      sourcePersistStartedAt,
      sourcePersistedAt,
      queuedAt,
    }).catch((error) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload] queued job claim failed", error);
      }
      return null;
    }),
  );
  logUploadPipeline(upload.uploadTraceId, "job_claim_done", {
    jobId: queuedClaim?.jobId ?? jobId,
    owner: queuedClaim?.owner ?? null,
    status: queuedClaim?.status ?? null,
    failureReason:
      queuedClaim && !queuedClaim.owner ? queuedClaim.failureReason : undefined,
  });

  if (queuedClaim && !queuedClaim.owner) {
    logUploadPipeline(upload.uploadTraceId, "response_202", {
      jobId: queuedClaim.jobId,
      status: queuedClaim.status,
      inFlightHit: true,
    });
    return jsonWithTiming(
      timing,
      {
        uploadTraceId: upload.uploadTraceId,
        jobId: queuedClaim.jobId,
        status: queuedClaim.status,
        fileHash,
        fileName: upload.displayFileName,
        pageCount,
        inFlightHit: true,
        failureReason: queuedClaim.failureReason,
      },
      { status: 202 },
    );
  }

  if (!queuedClaim) {
    await timing.measure("job_create", () =>
      createExtractionJob({
        jobId,
        extractionKey,
        uploadTraceId: upload.uploadTraceId,
        fileHash,
        fileName: upload.displayFileName,
        mimeType: upload.mimeType,
        extractionMode: upload.extractionMode,
        extractionModel: model,
        totalPages: pageCount,
        clerkUserId,
        sourcePersistStartedAt,
        sourcePersistedAt,
        queuedAt,
      }),
    );
    logUploadPipeline(upload.uploadTraceId, "job_created", {
      jobId,
      fileHash,
    });
  }

  try {
    triggerExtractionWorker(request, upload.uploadTraceId);

    logPerformanceEvent("upload_queued", {
      fileSizeBytes: upload.fileSizeBytes,
      pageCount,
      mimeType: upload.mimeType,
      extractionMode: upload.extractionMode,
      model,
      status: "queued",
      ...timing.summary(),
    });

    logUploadPipeline(upload.uploadTraceId, "response_202", {
      jobId: queuedClaim?.jobId ?? jobId,
      status: "queued",
    });
    return jsonWithTiming(
      timing,
      {
        uploadTraceId: upload.uploadTraceId,
        jobId: queuedClaim?.jobId ?? jobId,
        status: "queued",
        fileHash,
        fileName: upload.displayFileName,
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

type ParsedExtractionUpload = {
  uploadTraceId: string;
  file?: File;
  arrayBuffer?: ArrayBuffer;
  fileHash?: string;
  displayFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  pageCount?: number;
  extractionMode: ReturnType<typeof parseExtractionMode>;
  sourceAlreadyStored: boolean;
  unsupportedReason?: string | null;
};

async function parseExtractionUploadRequest(
  request: Request,
): Promise<ParsedExtractionUpload | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | {
          fileHash?: unknown;
          fileName?: unknown;
          mimeType?: unknown;
          fileSizeBytes?: unknown;
          sizeBytes?: unknown;
          pageCount?: unknown;
          extractionMode?: unknown;
          sourceAlreadyStored?: unknown;
          uploadTraceId?: unknown;
        }
      | null;

    const fileHash = typeof body?.fileHash === "string" ? body.fileHash.trim() : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const rawMimeType = typeof body?.mimeType === "string" ? body.mimeType.trim() : "";
    const rawSize = body?.fileSizeBytes ?? body?.sizeBytes;
    const fileSizeBytes = typeof rawSize === "number" ? rawSize : Number(rawSize);
    const rawPageCount = Number(body?.pageCount);
    const uploadTraceId = normalizeUploadTraceId(body?.uploadTraceId);

    if (!fileHash || !fileName || !Number.isFinite(fileSizeBytes) || fileSizeBytes < 0) {
      return null;
    }

    const mimeType = inferUploadMimeTypeFromName(fileName, rawMimeType);
    return {
      uploadTraceId,
      fileHash,
      displayFileName: fileName,
      mimeType,
      fileSizeBytes,
      pageCount:
        Number.isFinite(rawPageCount) && rawPageCount > 0
          ? Math.max(1, Math.floor(rawPageCount))
          : 1,
      extractionMode: parseExtractionMode(
        typeof body?.extractionMode === "string" ? body.extractionMode : null,
      ),
      sourceAlreadyStored: body?.sourceAlreadyStored !== false,
      unsupportedReason: getUnsupportedUploadReasonForNameAndMime(fileName, mimeType),
    };
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return null;

  const file = formData.get("file");
  if (!(file instanceof File)) return null;

  const requestedFileName = formData.get("fileName");
  const displayFileName =
    typeof requestedFileName === "string" && requestedFileName.trim()
      ? requestedFileName.trim()
      : file.name;
  const mimeType = inferUploadMimeType(file);
  const uploadTraceId = normalizeUploadTraceId(formData.get("uploadTraceId"));

  return {
    uploadTraceId,
    file,
    displayFileName,
    mimeType,
    fileSizeBytes: file.size,
    extractionMode: parseExtractionMode(formData.get("extractionMode")),
    sourceAlreadyStored: false,
    unsupportedReason:
      getUnsupportedUploadReason(file) ??
      getUnsupportedUploadReasonForNameAndMime(displayFileName, mimeType),
  };
}

function normalizeUploadTraceId(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[a-zA-Z0-9:_-]{8,96}$/.test(trimmed)) return trimmed;
  }
  return randomUUID();
}

function triggerExtractionWorker(request: Request, uploadTraceId?: string) {
  const secret = process.env.CRON_SECRET ?? process.env.EXTRACTION_STORAGE_SECRET;
  if (!secret) return;

  const workerUrl = new URL("/api/pdf/mcqs/worker", request.url);
  after(async () => {
    try {
      await fetch(workerUrl, {
        cache: "no-store",
        headers: {
          authorization: `Bearer ${secret}`,
          ...(uploadTraceId ? { "x-upload-trace-id": uploadTraceId } : {}),
        },
      });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload] extraction worker trigger failed", error);
      }
    }
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
