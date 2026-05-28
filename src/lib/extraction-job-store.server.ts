import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertProductionServerStorage,
  isConvexStorageConfigured,
  isDevelopmentStorageAllowed,
} from "@/lib/server-storage.server";
import { sanitizeUserFacingError } from "@/lib/user-facing-error.server";

export type ExtractionJobStatus = "queued" | "processing" | "ready" | "failed";

export type ExtractionJobRecord = {
  id: string;
  extractionKey?: string;
  ownerId?: string;
  fileHash: string;
  fileName?: string;
  mimeType?: string;
  extractionMode?: string;
  extractionModel?: string;
  clerkUserId?: string;
  status: ExtractionJobStatus;
  progressPagesProcessed: number;
  totalPages: number;
  error?: string;
  failureReason?: string;
  createdAt: number;
  updatedAt: number;
};

export type WorkerExtractionJob = {
  jobId: string;
  fileHash: string;
  fileName?: string;
  mimeType?: string;
  extractionMode?: string;
  extractionModel?: string;
  clerkUserId?: string;
  totalPages: number;
};

export type ActiveExtractionJob = {
  jobId: string;
  status: "queued" | "processing";
  fileHash: string;
  fileName?: string;
  totalPages: number;
  progressPagesProcessed: number;
};

const JOBS_DIR = path.join(process.cwd(), ".data", "extraction-jobs");
const EXTRACTION_RECORDS_DIR = path.join(process.cwd(), ".data", "pdf-extraction-records");
const CONVEX_DOCUMENT_SAFE_BYTES = 800 * 1024;

async function ensureJobsDir() {
  if (!isDevelopmentStorageAllowed()) return;
  await mkdir(JOBS_DIR, { recursive: true });
}

async function ensureExtractionRecordsDir() {
  if (!isDevelopmentStorageAllowed()) return;
  await mkdir(EXTRACTION_RECORDS_DIR, { recursive: true });
}

function jobFilePath(jobId: string) {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

function extractionRecordFilePath(fileHash: string, clerkUserId?: string) {
  const owner = (clerkUserId ?? "anonymous").replace(/[^a-zA-Z0-9:_-]/g, "_");
  const file = fileHash.replace(/[^a-zA-Z0-9:_-]/g, "_");
  return path.join(EXTRACTION_RECORDS_DIR, `${owner}-${file}.json`);
}

async function writeLocalJob(job: ExtractionJobRecord): Promise<void> {
  if (!isDevelopmentStorageAllowed()) return;
  await ensureJobsDir();
  await writeFile(jobFilePath(job.id), JSON.stringify(job), "utf8");
}

async function syncJobToConvex(job: ExtractionJobRecord): Promise<void> {
  if (!isConvexStorageConfigured()) return;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(
    process.env.NEXT_PUBLIC_CONVEX_URL!,
  );
  await client.mutation(api.extractionStorage.upsertExtractionJob, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    jobId: job.id,
    extractionKey: job.extractionKey,
    ownerId: job.ownerId,
    fileHash: job.fileHash,
    fileName: job.fileName,
    mimeType: job.mimeType,
    extractionMode: job.extractionMode,
    extractionModel: job.extractionModel,
    clerkUserId: job.clerkUserId,
    status: job.status,
    progressPagesProcessed: job.progressPagesProcessed,
    totalPages: job.totalPages,
    error: job.error,
    failureReason: job.failureReason,
  });
}

async function getConvexJob(jobId: string): Promise<ExtractionJobRecord | null> {
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
    id: row.jobId,
    extractionKey: row.extractionKey,
    ownerId: row.ownerId,
    fileHash: row.fileHash,
    fileName: row.fileName,
    mimeType: row.mimeType,
    extractionMode: row.extractionMode,
    extractionModel: row.extractionModel,
    clerkUserId: row.clerkUserId,
    status: row.status,
    progressPagesProcessed: row.progressPagesProcessed,
    totalPages: row.totalPages,
    error: row.error,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getExtractionJob(
  jobId: string,
): Promise<ExtractionJobRecord | null> {
  assertProductionServerStorage();

  if (isConvexStorageConfigured()) {
    const convexJob = await getConvexJob(jobId);
    if (convexJob) return convexJob;
  }

  if (isDevelopmentStorageAllowed()) {
    try {
      const raw = await readFile(jobFilePath(jobId), "utf8");
      return JSON.parse(raw) as ExtractionJobRecord;
    } catch {
      return null;
    }
  }

  return null;
}

export async function createExtractionJob(args: {
  jobId?: string;
  extractionKey?: string;
  ownerId?: string;
  fileHash: string;
  fileName?: string;
  mimeType?: string;
  extractionMode?: string;
  extractionModel?: string;
  totalPages: number;
  clerkUserId?: string;
}): Promise<ExtractionJobRecord> {
  assertProductionServerStorage();

  const now = Date.now();
  const job: ExtractionJobRecord = {
    id: args.jobId ?? randomUUID(),
    extractionKey: args.extractionKey,
    ownerId: args.ownerId,
    fileHash: args.fileHash,
    fileName: args.fileName,
    mimeType: args.mimeType,
    extractionMode: args.extractionMode,
    extractionModel: args.extractionModel,
    clerkUserId: args.clerkUserId,
    status: "queued",
    progressPagesProcessed: 0,
    totalPages: args.totalPages,
    createdAt: now,
    updatedAt: now,
  };

  if (isConvexStorageConfigured()) {
    await syncJobToConvex(job);
  } else if (!isDevelopmentStorageAllowed()) {
    throw new Error(
      "Cannot create extraction job in production without Convex storage.",
    );
  }

  await writeLocalJob(job);
  return job;
}

export async function updateExtractionJob(
  jobId: string,
  patch: Partial<
    Pick<
      ExtractionJobRecord,
      "status" | "progressPagesProcessed" | "totalPages" | "error" | "failureReason"
    >
  >,
): Promise<ExtractionJobRecord | null> {
  assertProductionServerStorage();

  let job: ExtractionJobRecord | null = null;

  if (isDevelopmentStorageAllowed()) {
    try {
      const raw = await readFile(jobFilePath(jobId), "utf8");
      job = JSON.parse(raw) as ExtractionJobRecord;
    } catch {
      job = null;
    }
  }

  if (!job && isConvexStorageConfigured()) {
    job = await getConvexJob(jobId);
  }

  if (!job) return null;

  const sanitizedPatch = {
    ...patch,
    ...(patch.error !== undefined
      ? { error: sanitizeUserFacingError(patch.error) }
      : {}),
  };

  const updated: ExtractionJobRecord = {
    ...job,
    ...sanitizedPatch,
    updatedAt: Date.now(),
  };

  if (isConvexStorageConfigured()) {
    await syncJobToConvex(updated);
  }

  await writeLocalJob(updated);
  return updated;
}

export async function claimNextWorkerExtractionJob(args?: {
  staleAfterMs?: number;
}): Promise<WorkerExtractionJob | null> {
  assertProductionServerStorage();

  if (!isConvexStorageConfigured()) return null;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  return await client.mutation(api.extractionStorage.claimNextWorkerExtractionJob, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    staleAfterMs: args?.staleAfterMs ?? 120_000,
  });
}

export async function getActiveExtractionJobForUpload(args: {
  fileHash: string;
  extractionMode?: string;
  extractionModel?: string;
  clerkUserId?: string;
  staleAfterMs?: number;
}): Promise<ActiveExtractionJob | null> {
  assertProductionServerStorage();

  if (!isConvexStorageConfigured()) return null;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const job = await client.query(api.extractionStorage.getActiveExtractionJobForUpload, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    fileHash: args.fileHash,
    extractionMode: args.extractionMode,
    extractionModel: args.extractionModel,
    clerkUserId: args.clerkUserId,
    staleAfterMs: args.staleAfterMs ?? 120_000,
  });
  if (!job || (job.status !== "queued" && job.status !== "processing")) return null;
  return {
    jobId: job.jobId,
    status: job.status,
    fileHash: job.fileHash,
    fileName: job.fileName,
    totalPages: job.totalPages,
    progressPagesProcessed: job.progressPagesProcessed,
  };
}

export async function persistPdfExtractionRecord(args: {
  clerkUserId?: string;
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  extractionMode?: string;
  extractionModel?: string;
  appExtractionVersion?: string;
  title: string;
  summary: string;
  mcqs: unknown;
  sourceChunks: unknown;
}): Promise<void> {
  assertProductionServerStorage();

  if (isDevelopmentStorageAllowed()) {
    await ensureExtractionRecordsDir();
    await writeFile(
      extractionRecordFilePath(args.fileHash, args.clerkUserId),
      JSON.stringify(args),
      "utf8",
    );
  }

  if (!isConvexStorageConfigured()) {
    if (!isDevelopmentStorageAllowed()) {
      throw new Error(
        "Cannot persist extraction record in production without Convex storage.",
      );
    }
    return;
  }

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const extractionPayload = {
    title: args.title,
    summary: args.summary,
    mcqs: args.mcqs,
    sourceChunks: args.sourceChunks,
  };
  const encodedPayload = new TextEncoder().encode(JSON.stringify(extractionPayload));
  const payloadBytes = encodedPayload.buffer.slice(
    encodedPayload.byteOffset,
    encodedPayload.byteOffset + encodedPayload.byteLength,
  ) as ArrayBuffer;

  if (encodedPayload.byteLength > CONVEX_DOCUMENT_SAFE_BYTES) {
    await client.action(api.extractionStorage.upsertPdfExtractionPayload, {
      secret: process.env.EXTRACTION_STORAGE_SECRET!,
      clerkUserId: args.clerkUserId,
      fileHash: args.fileHash,
      fileName: args.fileName,
      pageCount: args.pageCount,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      appExtractionVersion: args.appExtractionVersion,
      title: args.title,
      summary: args.summary,
      payloadBytes,
    });
    return;
  }

  await client.mutation(api.extractionStorage.upsertPdfExtraction, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    clerkUserId: args.clerkUserId,
    fileHash: args.fileHash,
    fileName: args.fileName,
    pageCount: args.pageCount,
    extractionMode: args.extractionMode,
    extractionModel: args.extractionModel,
    appExtractionVersion: args.appExtractionVersion,
    title: args.title,
    summary: args.summary,
    mcqs: args.mcqs,
    sourceChunks: args.sourceChunks,
  });
}

export type PersistedPdfExtractionRecord = {
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  extractionMode?: string;
  extractionModel?: string;
  appExtractionVersion?: string;
  title: string;
  summary: string;
  mcqs: unknown;
  sourceChunks: unknown;
};

export async function getPersistedPdfExtractionRecord(args: {
  clerkUserId?: string;
  fileHash: string;
}): Promise<PersistedPdfExtractionRecord | null> {
  assertProductionServerStorage();

  if (isDevelopmentStorageAllowed()) {
    try {
      const raw = await readFile(
        extractionRecordFilePath(args.fileHash, args.clerkUserId),
        "utf8",
      );
      return JSON.parse(raw) as PersistedPdfExtractionRecord;
    } catch {
      // Fall through to Convex when configured.
    }
  }

  if (!isConvexStorageConfigured()) return null;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const row = await client.query(api.extractionStorage.getPdfExtractionByUserAndFile, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    clerkUserId: args.clerkUserId,
    fileHash: args.fileHash,
  });
  if (!row) return null;

  const payload =
    Array.isArray(row.mcqs)
      ? row
      : row.payloadUrl
        ? await fetchPersistedExtractionPayload(row.payloadUrl)
        : null;
  if (!payload?.mcqs || !Array.isArray(payload.mcqs)) return null;

  return {
    fileHash: row.fileHash,
    fileName: row.fileName,
    pageCount: row.pageCount,
    extractionMode: row.extractionMode,
    extractionModel: row.extractionModel,
    appExtractionVersion: row.appExtractionVersion,
    title: payload.title ?? row.title,
    summary: payload.summary ?? row.summary,
    mcqs: payload.mcqs,
    sourceChunks: payload.sourceChunks ?? [],
  };
}

async function fetchPersistedExtractionPayload(
  url: string,
): Promise<Partial<PersistedPdfExtractionRecord> | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as
    | Partial<PersistedPdfExtractionRecord>
    | null;
}
