import {
  getExtractionJob,
  getPersistedPdfExtractionRecord,
  updateExtractionJob,
  type ExtractionJobRecord,
} from "@/lib/extraction-job-store.server";
import { isPdfMcqResult } from "@/lib/pdf-mcqs";
import { getQuotaSubject } from "@/lib/request-user.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";
import { sanitizeUserFacingError } from "@/lib/user-facing-error.server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;

  try {
    const job = await getExtractionJob(decodeURIComponent(jobId));
    if (!job) {
      return Response.json({ error: "Extraction job not found." }, { status: 404 });
    }

    const requester = await getQuotaSubject(request);
    if (
      job.clerkUserId &&
      requester &&
      !requester.startsWith("anon:") &&
      job.clerkUserId !== requester
    ) {
      return Response.json({ error: "Extraction job not found." }, { status: 404 });
    }

    const base = {
      uploadTraceId: job.uploadTraceId,
      jobId: job.id,
      status: job.status,
      progressPagesProcessed: job.progressPagesProcessed,
      totalPages: job.totalPages,
      fileHash: job.fileHash,
      createdAt: job.createdAt,
      sourcePersistStartedAt: job.sourcePersistStartedAt,
      sourcePersistedAt: job.sourcePersistedAt,
      queuedAt: job.queuedAt,
      workerClaimedAt: job.workerClaimedAt,
      extractionStartedAt: job.extractionStartedAt,
      extractionFinishedAt: job.extractionFinishedAt,
      readyAt: job.readyAt,
      failedAt: job.failedAt,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage
        ? sanitizeUserFacingError(job.errorMessage)
        : undefined,
      error: job.error
        ? sanitizeUserFacingError(job.error)
        : undefined,
      failureReason: job.failureReason,
    };

    const recovered = await recoverReadyResultFromPersistedRecord(job);
    if (recovered) {
      return Response.json({
        ...base,
        status: "ready",
        progressPagesProcessed: job.totalPages,
        error: undefined,
        failureReason: undefined,
        result: recovered,
      });
    }

    if (job.status !== "ready") {
      return Response.json(base);
    }

    return Response.json({
      ...base,
      status: "processing",
      error: "Extraction result is still being finalized.",
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
    throw error;
  }
}

async function recoverReadyResultFromPersistedRecord(job: ExtractionJobRecord) {
  const shouldCheckPersistedResult =
    job.status === "ready" ||
    (job.totalPages > 0 && job.progressPagesProcessed >= job.totalPages);

  if (!shouldCheckPersistedResult) return null;

  const record = await getPersistedPdfExtractionRecord({
    clerkUserId: job.clerkUserId,
    fileHash: job.fileHash,
  });

  const result = {
    title: record?.title,
    summary: record?.summary,
    mcqs: record?.mcqs,
  };

  if (!record || !isPdfMcqResult(result)) return null;

  if (job.status !== "ready") {
    await updateExtractionJob(job.id, {
      status: "ready",
      progressPagesProcessed: job.totalPages,
      totalPages: job.totalPages,
    }).catch((error) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload] recovered completed extraction job locally", error);
      }
    });
  }

  return {
    title: record.title,
    summary: record.summary,
    mcqs: record.mcqs,
    fileHash: record.fileHash,
    fileName: record.fileName,
    pageCount: record.pageCount,
    sourceChunks: record.sourceChunks,
  };
}
