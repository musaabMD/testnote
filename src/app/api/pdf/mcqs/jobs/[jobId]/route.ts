import {
  getExtractionJob,
  getPersistedPdfExtractionRecord,
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
      jobId: job.id,
      status: job.status,
      progressPagesProcessed: job.progressPagesProcessed,
      totalPages: job.totalPages,
      fileHash: job.fileHash,
      error: job.error
        ? sanitizeUserFacingError(job.error)
        : undefined,
      failureReason: job.failureReason,
    };

    if (job.status !== "ready") {
      return Response.json(base);
    }

    const record = await getPersistedPdfExtractionRecord({
      clerkUserId: job.clerkUserId,
      fileHash: job.fileHash,
    });

    const result = {
      title: record?.title,
      summary: record?.summary,
      mcqs: record?.mcqs,
    };

    if (!record || !isPdfMcqResult(result)) {
      return Response.json({
        ...base,
        status: "processing",
        error: "Extraction result is still being finalized.",
      });
    }

    return Response.json({
      ...base,
      result: {
        title: record.title,
        summary: record.summary,
        mcqs: record.mcqs,
        fileHash: record.fileHash,
        fileName: record.fileName,
        pageCount: record.pageCount,
        sourceChunks: record.sourceChunks,
      },
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
    throw error;
  }
}
