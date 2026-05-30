import { getConvexSourceFileUrl } from "@/lib/convex-source-file.server";
import {
  claimNextWorkerExtractionJob,
  updateExtractionJob,
} from "@/lib/extraction-job-store.server";
import { parseExtractionMode } from "@/lib/extraction-config";
import { isMistralOcrAvailable } from "@/lib/mistral-ocr.server";
import { runPdfMcqExtraction } from "@/lib/pdf-extraction.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";
import { logUploadPipeline } from "@/lib/upload-pipeline-trace";
import { sanitizeUserFacingError } from "@/lib/user-facing-error.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const unauthorized = authorizeWorkerRequest(request);
  if (unauthorized) return unauthorized;
  const requestTraceId = request.headers.get("x-upload-trace-id") ?? undefined;
  logUploadPipeline(requestTraceId, "worker_called");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !isMistralOcrAvailable()) {
    return Response.json(
      { error: "MISTRAL_OCR_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    logUploadPipeline(requestTraceId, "job_claim_start");
    const job = await claimNextWorkerExtractionJob({
      staleAfterMs: getWorkerStaleAfterMs(),
    });

    if (!job) {
      logUploadPipeline(requestTraceId, "worker_idle");
      return Response.json({ processed: 0, status: "idle" });
    }
    logUploadPipeline(job.uploadTraceId ?? requestTraceId, "job_claimed", {
      jobId: job.jobId,
      fileHash: job.fileHash,
      totalPages: job.totalPages,
    });

    if (!job.clerkUserId) {
      await failJob(
        job.jobId,
        job.uploadTraceId ?? requestTraceId,
        "source_file_missing",
        "Queued job has no signed-in source owner.",
      );
      return Response.json({ processed: 0, failed: 1, jobId: job.jobId });
    }

    logUploadPipeline(job.uploadTraceId ?? requestTraceId, "r2_download_start", {
      jobId: job.jobId,
      fileHash: job.fileHash,
    });
    const source = await getConvexSourceFileUrl({
      clerkUserId: job.clerkUserId,
      fileHash: job.fileHash,
    });

    if (!source?.url) {
      await failJob(
        job.jobId,
        job.uploadTraceId ?? requestTraceId,
        "source_file_missing",
        "Original source file is not available for background extraction.",
      );
      return Response.json({ processed: 0, failed: 1, jobId: job.jobId });
    }

    try {
      const response = await fetch(source.url, { cache: "no-store" });
      if (!response.ok) {
        await failJob(
          job.jobId,
          job.uploadTraceId ?? requestTraceId,
          "source_file_missing",
          "Could not download the original source file for background extraction.",
        );
        return Response.json({ processed: 0, failed: 1, jobId: job.jobId });
      }

      const arrayBuffer = await response.arrayBuffer();
      logUploadPipeline(job.uploadTraceId ?? requestTraceId, "r2_download_done", {
        jobId: job.jobId,
        bytes: arrayBuffer.byteLength,
      });
      const extractionStartedAt = Date.now();
      await updateExtractionJob(job.jobId, {
        status: "processing",
        extractionStartedAt,
      });
      logUploadPipeline(job.uploadTraceId ?? requestTraceId, "extraction_start", {
        jobId: job.jobId,
        bytes: arrayBuffer.byteLength,
      });
      const result = await runPdfMcqExtraction({
        apiKey: apiKey ?? "",
        fileName: job.fileName ?? source.fileName,
        mimeType: job.mimeType ?? source.mimeType,
        arrayBuffer,
        fileSizeBytes: arrayBuffer.byteLength,
        extractionMode: parseExtractionMode(job.extractionMode ?? null),
        fileHash: job.fileHash,
        pageCount: job.totalPages,
        clerkUserId: job.clerkUserId,
        jobId: job.jobId,
      });

      if ("mcqs" in result) {
        const extractionFinishedAt = Date.now();
        logUploadPipeline(job.uploadTraceId ?? requestTraceId, "extraction_done", {
          jobId: job.jobId,
          questionCount: result.mcqs.length,
          pageCount: result.pageCount ?? job.totalPages,
        });
        await updateExtractionJob(job.jobId, {
          status: "ready",
          progressPagesProcessed: job.totalPages,
          totalPages: job.totalPages,
          extractionFinishedAt,
          readyAt: extractionFinishedAt,
        });
        logUploadPipeline(job.uploadTraceId ?? requestTraceId, "job_ready", {
          jobId: job.jobId,
        });
      } else {
        await failJob(
          job.jobId,
          job.uploadTraceId ?? requestTraceId,
          result.failureReason,
          sanitizeUserFacingError(result.error),
        );
        return Response.json({ processed: 0, failed: 1, jobId: job.jobId });
      }
    } catch (error) {
      await failJob(
        job.jobId,
        job.uploadTraceId ?? requestTraceId,
        "unknown_transient_error",
        sanitizeUserFacingError(error instanceof Error ? error.message : undefined),
      );
      return Response.json({ processed: 0, failed: 1, jobId: job.jobId });
    }

    return Response.json({ processed: 1, status: "ready", jobId: job.jobId });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;

    if (process.env.NODE_ENV === "development") {
      console.warn("[extraction-worker] failed:", error);
    }

    return Response.json(
      {
        error: sanitizeUserFacingError(
          error instanceof Error ? error.message : undefined,
        ),
      },
      { status: 500 },
    );
  }
}

function authorizeWorkerRequest(request: Request): Response | null {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const storageSecret = process.env.EXTRACTION_STORAGE_SECRET;
  const expectedSecrets = [cronSecret, storageSecret].filter(Boolean);

  if (
    expectedSecrets.length === 0 ||
    !expectedSecrets.some((secret) => authHeader === `Bearer ${secret}`)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

async function failJob(
  jobId: string,
  uploadTraceId: string | undefined,
  failureReason: string,
  error: string,
) {
  logUploadPipeline(uploadTraceId, "job_failed", {
    jobId,
    failureReason,
    error,
  });
  const failedAt = Date.now();
  await updateExtractionJob(jobId, {
    status: "failed",
    failureReason,
    error,
    failedAt,
    errorCode: failureReason,
    errorMessage: error,
  });
}

function getWorkerStaleAfterMs() {
  const raw = process.env.EXTRACTION_WORKER_STALE_AFTER_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}
