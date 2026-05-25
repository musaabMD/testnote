import { randomUUID } from "node:crypto";
import type { ExtractionFailureReason } from "@/lib/extraction-failure.server";
import { isConvexStorageConfigured } from "@/lib/server-storage.server";

export type DistributedExtractionClaim =
  | {
      enabled: false;
      owner: true;
      jobId?: string;
      ownerId?: string;
      status: "processing";
    }
  | {
      enabled: true;
      owner: true;
      jobId: string;
      ownerId: string;
      status: "processing";
    }
  | {
      enabled: true;
      owner: false;
      jobId: string;
      status: "processing" | "ready" | "failed";
      failureReason?: ExtractionFailureReason;
      error?: string;
    };

export async function claimDistributedExtraction(args: {
  extractionKey: string;
  fileHash: string;
  clerkUserId?: string;
  totalPages: number;
  jobId?: string;
}): Promise<DistributedExtractionClaim> {
  if (!isConvexStorageConfigured()) {
    return { enabled: false, owner: true, status: "processing", jobId: args.jobId };
  }

  const ownerId = randomUUID();
  const jobId = args.jobId ?? randomUUID();
  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const result = await client.mutation(api.extractionStorage.claimExtractionJob, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    extractionKey: args.extractionKey,
    jobId,
    ownerId,
    fileHash: args.fileHash,
    clerkUserId: args.clerkUserId,
    totalPages: args.totalPages,
    staleAfterMs: getEnvMs("EXTRACTION_LOCK_STALE_AFTER_MS", 10 * 60 * 1000),
    retryCooldownMs: getEnvMs("EXTRACTION_LOCK_RETRY_COOLDOWN_MS", 60 * 1000),
  });

  if (result.owner) {
    return {
      enabled: true,
      owner: true,
      status: "processing",
      jobId: result.jobId,
      ownerId,
    };
  }

  return {
    enabled: true,
    owner: false,
    status: result.status,
    jobId: result.jobId,
    failureReason: result.failureReason as ExtractionFailureReason | undefined,
    error: result.error,
  };
}

export async function getDistributedExtractionJob(jobId: string): Promise<{
  status: "queued" | "processing" | "ready" | "failed";
  failureReason?: ExtractionFailureReason;
  error?: string;
} | null> {
  if (!isConvexStorageConfigured()) return null;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const row = await client.query(api.extractionStorage.getExtractionJobById, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    jobId,
  });
  if (!row) return null;
  return {
    status: row.status,
    failureReason: row.failureReason as ExtractionFailureReason | undefined,
    error: row.error,
  };
}

function getEnvMs(envKey: string, fallbackMs: number) {
  const parsed = Number(process.env[envKey]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}
