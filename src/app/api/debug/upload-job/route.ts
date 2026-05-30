import { getConvexSourceFileUrl } from "@/lib/convex-source-file.server";
import { getExtractionJob } from "@/lib/extraction-job-store.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";
import { sanitizeUserFacingError } from "@/lib/user-facing-error.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = authorizeDebugRequest(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  if (!jobId) {
    return Response.json({ error: "Missing jobId." }, { status: 400 });
  }

  try {
    const job = await getExtractionJob(jobId);
    if (!job) {
      return Response.json({ error: "Extraction job not found." }, { status: 404 });
    }

    const source =
      job.clerkUserId && job.fileHash
        ? await getConvexSourceFileUrl({
            clerkUserId: job.clerkUserId,
            fileHash: job.fileHash,
          }).catch(() => null)
        : null;

    return Response.json({
      jobId: job.id,
      status: job.status,
      uploadTraceId: job.uploadTraceId,
      fileHash: job.fileHash,
      fileName: job.fileName,
      sourceAvailable: Boolean(source?.url),
      createdAt: job.createdAt,
      sourcePersistStartedAt: job.sourcePersistStartedAt,
      sourcePersistedAt: job.sourcePersistedAt,
      queuedAt: job.queuedAt,
      workerClaimedAt: job.workerClaimedAt,
      extractionStartedAt: job.extractionStartedAt,
      extractionFinishedAt: job.extractionFinishedAt,
      readyAt: job.readyAt,
      failedAt: job.failedAt,
      errorCode: job.errorCode ?? job.failureReason,
      errorMessage: sanitizeUserFacingError(job.errorMessage ?? job.error),
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
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

function authorizeDebugRequest(request: Request): Response | null {
  const expectedSecrets = [
    process.env.EXTRACTION_STORAGE_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean);
  const authHeader = request.headers.get("authorization");
  const debugHeader = request.headers.get("x-debug-secret");

  if (expectedSecrets.length === 0) {
    return new Response("Debug secret is not configured.", { status: 503 });
  }

  if (
    expectedSecrets.some(
      (secret) => authHeader === `Bearer ${secret}` || debugHeader === secret,
    )
  ) {
    return null;
  }

  return new Response("Unauthorized", { status: 401 });
}
