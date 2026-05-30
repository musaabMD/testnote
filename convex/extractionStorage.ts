import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { r2 } from "./r2";

function assertStorageSecret(secret: string) {
  const expected = process.env.EXTRACTION_STORAGE_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized extraction storage request.");
  }
}

function safeR2PathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96) || "unknown";
}

function r2ObjectPrefixSegments() {
  return (process.env.R2_OBJECT_PREFIX ?? "")
    .split("/")
    .map((segment) => safeR2PathSegment(segment.trim()))
    .filter(Boolean);
}

function sourcePreviewR2Key(args: {
  fileId: string;
  pageNumber: number;
  sourcePagePreviewId: string;
}) {
  return [
    ...r2ObjectPrefixSegments(),
    "source-previews",
    safeR2PathSegment(args.fileId),
    `page-${args.pageNumber}-${safeR2PathSegment(args.sourcePagePreviewId)}-${crypto.randomUUID()}.webp`,
  ].join("/");
}

const EXTRACTION_PAYLOAD_MIME_TYPE = "application/json";

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96) || "unknown";
}

function extractionPayloadR2Key(args: {
  kind: "file-cache" | "pdf-extraction";
  fileHash: string;
  clerkUserId?: string;
  cacheKey?: string;
}) {
  const prefix = (process.env.R2_OBJECT_PREFIX ?? "")
    .split("/")
    .map((segment) => safePathSegment(segment.trim()))
    .filter(Boolean);
  const owner = args.clerkUserId ? safePathSegment(args.clerkUserId) : "shared";
  const key = args.cacheKey ? safePathSegment(args.cacheKey) : safePathSegment(args.fileHash);

  return [
    ...prefix,
    "extraction-payloads",
    args.kind,
    owner,
    safePathSegment(args.fileHash),
    `${key}-${crypto.randomUUID()}.json`,
  ].join("/");
}

const extractionJobStatus = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);
const STALE_JOB_RECOVERY_BATCH_SIZE = 50;
const QUEUE_HEALTH_SAMPLE_SIZE = 200;

const extractionPageStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("done"),
  v.literal("needs_review"),
  v.literal("failed"),
);

const pageAuditStatus = v.union(
  v.literal("passed"),
  v.literal("partial"),
  v.literal("failed"),
);

function isPermanentFailure(reason: string | undefined) {
  return (
    reason === "no_selectable_text" ||
    reason === "selectable_text_found_but_no_questions" ||
    reason === "file_too_large" ||
    reason === "unsupported_file_type" ||
    reason === "quota_exceeded" ||
    reason === "suspicious_extraction_cost" ||
    reason === "chunk_only_mode_unsupported"
  );
}

export const getFileCache = query({
  args: {
    secret: v.string(),
    fileHash: v.string(),
    extractionMode: v.string(),
    extractionModel: v.string(),
    appExtractionVersion: v.string(),
    promptVersion: v.string(),
    schemaVersion: v.string(),
    renderVersion: v.string(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const row = await ctx.db
      .query("fileCache")
      .withIndex("by_cache_key", (q) =>
        q
          .eq("fileHash", args.fileHash)
          .eq("extractionMode", args.extractionMode)
          .eq("extractionModel", args.extractionModel)
          .eq("appExtractionVersion", args.appExtractionVersion)
          .eq("promptVersion", args.promptVersion)
          .eq("schemaVersion", args.schemaVersion)
          .eq("renderVersion", args.renderVersion),
      )
      .first();

    if (!row) return null;

    return {
      title: row.title,
      summary: row.summary,
      mcqs: row.mcqs,
      sourceChunks: row.sourceChunks,
      payloadUrl: row.payloadR2Key
        ? await r2.getUrl(row.payloadR2Key, { expiresIn: 60 * 10 })
        : undefined,
      payloadStorage: row.payloadStorage,
      payloadSizeBytes: row.payloadSizeBytes,
      createdAt: row.createdAt,
    };
  },
});

export const upsertFileCache = mutation({
  args: {
    secret: v.string(),
    fileHash: v.string(),
    extractionMode: v.string(),
    extractionModel: v.string(),
    appExtractionVersion: v.string(),
    promptVersion: v.string(),
    schemaVersion: v.string(),
    renderVersion: v.string(),
    pageCount: v.number(),
    title: v.string(),
    summary: v.string(),
    mcqs: v.any(),
    sourceChunks: v.any(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const existing = await ctx.db
      .query("fileCache")
      .withIndex("by_cache_key", (q) =>
        q
          .eq("fileHash", args.fileHash)
          .eq("extractionMode", args.extractionMode)
          .eq("extractionModel", args.extractionModel)
          .eq("appExtractionVersion", args.appExtractionVersion)
          .eq("promptVersion", args.promptVersion)
          .eq("schemaVersion", args.schemaVersion)
          .eq("renderVersion", args.renderVersion),
      )
      .first();

    const payload = {
      fileHash: args.fileHash,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      appExtractionVersion: args.appExtractionVersion,
      promptVersion: args.promptVersion,
      schemaVersion: args.schemaVersion,
      renderVersion: args.renderVersion,
      pageCount: args.pageCount,
      title: args.title,
      summary: args.summary,
      mcqs: args.mcqs,
      sourceChunks: args.sourceChunks,
      payloadStorage: "convex" as const,
      payloadR2Key: undefined,
      payloadSizeBytes: undefined,
      createdAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("fileCache", payload);
  },
});

export const upsertFileCachePayload = action({
  args: {
    secret: v.string(),
    fileHash: v.string(),
    extractionMode: v.string(),
    extractionModel: v.string(),
    appExtractionVersion: v.string(),
    promptVersion: v.string(),
    schemaVersion: v.string(),
    renderVersion: v.string(),
    pageCount: v.number(),
    title: v.string(),
    summary: v.string(),
    payloadBytes: v.bytes(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const cacheKey = [
      args.fileHash,
      args.extractionMode,
      args.extractionModel,
      args.appExtractionVersion,
      args.promptVersion,
      args.schemaVersion,
      args.renderVersion,
    ].join(":");
    const r2Key = await r2.store(
      ctx,
      new Blob([args.payloadBytes], { type: EXTRACTION_PAYLOAD_MIME_TYPE }),
      {
        key: extractionPayloadR2Key({
          kind: "file-cache",
          fileHash: args.fileHash,
          cacheKey,
        }),
        type: EXTRACTION_PAYLOAD_MIME_TYPE,
        cacheControl: "private, max-age=3600",
      },
    );

    await ctx.runMutation(internal.extractionStorage.upsertFileCacheR2Metadata, {
      fileHash: args.fileHash,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      appExtractionVersion: args.appExtractionVersion,
      promptVersion: args.promptVersion,
      schemaVersion: args.schemaVersion,
      renderVersion: args.renderVersion,
      pageCount: args.pageCount,
      title: args.title,
      summary: args.summary,
      payloadR2Key: r2Key,
      payloadSizeBytes: args.payloadBytes.byteLength,
    });

    return r2Key;
  },
});

export const upsertFileCacheR2Metadata = internalMutation({
  args: {
    fileHash: v.string(),
    extractionMode: v.string(),
    extractionModel: v.string(),
    appExtractionVersion: v.string(),
    promptVersion: v.string(),
    schemaVersion: v.string(),
    renderVersion: v.string(),
    pageCount: v.number(),
    title: v.string(),
    summary: v.string(),
    payloadR2Key: v.string(),
    payloadSizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fileCache")
      .withIndex("by_cache_key", (q) =>
        q
          .eq("fileHash", args.fileHash)
          .eq("extractionMode", args.extractionMode)
          .eq("extractionModel", args.extractionModel)
          .eq("appExtractionVersion", args.appExtractionVersion)
          .eq("promptVersion", args.promptVersion)
          .eq("schemaVersion", args.schemaVersion)
          .eq("renderVersion", args.renderVersion),
      )
      .first();

    const payload = {
      fileHash: args.fileHash,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      appExtractionVersion: args.appExtractionVersion,
      promptVersion: args.promptVersion,
      schemaVersion: args.schemaVersion,
      renderVersion: args.renderVersion,
      pageCount: args.pageCount,
      title: args.title,
      summary: args.summary,
      mcqs: undefined,
      sourceChunks: undefined,
      payloadStorage: "r2" as const,
      payloadR2Key: args.payloadR2Key,
      payloadSizeBytes: args.payloadSizeBytes,
      createdAt: Date.now(),
    };

    if (existing) {
      if (existing.payloadR2Key && existing.payloadR2Key !== args.payloadR2Key) {
        await r2.deleteObject(ctx, existing.payloadR2Key);
      }
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("fileCache", payload);
  },
});

export const upsertExtractionJob = mutation({
  args: {
    secret: v.string(),
    jobId: v.string(),
    extractionKey: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    uploadTraceId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    status: extractionJobStatus,
    progressPagesProcessed: v.number(),
    totalPages: v.number(),
    error: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    sourcePersistStartedAt: v.optional(v.number()),
    sourcePersistedAt: v.optional(v.number()),
    queuedAt: v.optional(v.number()),
    workerClaimedAt: v.optional(v.number()),
    extractionStartedAt: v.optional(v.number()),
    extractionFinishedAt: v.optional(v.number()),
    readyAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const existing = await ctx.db
      .query("extractionJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .first();

    const payload: {
      jobId: string;
      extractionKey?: string;
      ownerId?: string;
      uploadTraceId?: string;
      fileHash: string;
      fileName?: string;
      mimeType?: string;
      extractionMode?: string;
      extractionModel?: string;
      clerkUserId?: string;
      status: "queued" | "processing" | "ready" | "failed";
      progressPagesProcessed: number;
      totalPages: number;
      error?: string;
      failureReason?: string;
      sourcePersistStartedAt?: number;
      sourcePersistedAt?: number;
      queuedAt?: number;
      workerClaimedAt?: number;
      extractionStartedAt?: number;
      extractionFinishedAt?: number;
      readyAt?: number;
      failedAt?: number;
      errorCode?: string;
      errorMessage?: string;
      updatedAt: number;
    } = {
      jobId: args.jobId,
      uploadTraceId: args.uploadTraceId,
      fileHash: args.fileHash,
      fileName: args.fileName,
      mimeType: args.mimeType,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      clerkUserId: args.clerkUserId,
      status: args.status,
      progressPagesProcessed: args.progressPagesProcessed,
      totalPages: args.totalPages,
      error: args.error,
      failureReason: args.failureReason,
      sourcePersistStartedAt: args.sourcePersistStartedAt,
      sourcePersistedAt: args.sourcePersistedAt,
      queuedAt: args.queuedAt,
      workerClaimedAt: args.workerClaimedAt,
      extractionStartedAt: args.extractionStartedAt,
      extractionFinishedAt: args.extractionFinishedAt,
      readyAt: args.readyAt,
      failedAt: args.failedAt,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    };
    if (args.extractionKey !== undefined) payload.extractionKey = args.extractionKey;
    if (args.ownerId !== undefined) payload.ownerId = args.ownerId;

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("extractionJobs", {
      ...payload,
      createdAt: Date.now(),
    });
  },
});

export const getExtractionJobById = query({
  args: {
    secret: v.string(),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);
    return await ctx.db
      .query("extractionJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .first();
  },
});

export const getExtractionQueueHealth = query({
  args: {
    secret: v.string(),
    staleAfterMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const now = Date.now();
    const cutoff = now - args.staleAfterMs;
    const queued = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status_updated", (q) => q.eq("status", "queued"))
      .order("asc")
      .take(QUEUE_HEALTH_SAMPLE_SIZE + 1);
    const processing = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status_updated", (q) => q.eq("status", "processing"))
      .order("asc")
      .take(QUEUE_HEALTH_SAMPLE_SIZE + 1);
    const staleQueued = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "queued").lt("updatedAt", cutoff),
      )
      .order("asc")
      .take(QUEUE_HEALTH_SAMPLE_SIZE + 1);
    const staleProcessing = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "processing").lt("updatedAt", cutoff),
      )
      .order("asc")
      .take(QUEUE_HEALTH_SAMPLE_SIZE + 1);
    const recentFailed = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status_updated", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(50);

    return {
      now,
      staleAfterMs: args.staleAfterMs,
      sampleLimit: QUEUE_HEALTH_SAMPLE_SIZE,
      queued: summarizeRows(queued),
      processing: summarizeRows(processing),
      staleQueued: summarizeRows(staleQueued),
      staleProcessing: summarizeRows(staleProcessing),
      recentFailed: recentFailed.map((job) => ({
        jobId: job.jobId,
        uploadTraceId: job.uploadTraceId,
        fileHash: job.fileHash,
        fileName: job.fileName,
        failureReason: job.failureReason,
        errorCode: job.errorCode,
        updatedAt: job.updatedAt,
        failedAt: job.failedAt,
      })),
    };
  },
});

function summarizeRows(rows: Array<{ updatedAt: number }>) {
  const capped = rows.length > QUEUE_HEALTH_SAMPLE_SIZE;
  const visibleRows = capped ? rows.slice(0, QUEUE_HEALTH_SAMPLE_SIZE) : rows;
  return {
    count: visibleRows.length,
    capped,
    oldestUpdatedAt: visibleRows[0]?.updatedAt,
    newestUpdatedAt: visibleRows.at(-1)?.updatedAt,
  };
}

export const claimNextWorkerExtractionJob = mutation({
  args: {
    secret: v.string(),
    staleAfterMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const now = Date.now();
    const cutoff = now - args.staleAfterMs;
    const queued = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status_updated", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    const staleProcessing = await ctx.db
      .query("extractionJobs")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "processing").lt("updatedAt", cutoff),
      )
      .order("asc")
      .first();

    const job =
      queued && staleProcessing
        ? queued.updatedAt <= staleProcessing.updatedAt
          ? queued
          : staleProcessing
        : queued ?? staleProcessing;

    if (!job) return null;

    await ctx.db.patch(job._id, {
      status: "processing",
      error: undefined,
      failureReason: undefined,
      workerClaimedAt: now,
      updatedAt: now,
    });

    return {
      jobId: job.jobId,
      uploadTraceId: job.uploadTraceId,
      fileHash: job.fileHash,
      fileName: job.fileName,
      mimeType: job.mimeType,
      extractionMode: job.extractionMode,
      extractionModel: job.extractionModel,
      clerkUserId: job.clerkUserId,
      totalPages: job.totalPages,
    };
  },
});

export const getActiveExtractionJobForUpload = query({
  args: {
    secret: v.string(),
    fileHash: v.string(),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    staleAfterMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const cutoff = Date.now() - args.staleAfterMs;
    const jobs = await ctx.db
      .query("extractionJobs")
      .withIndex("by_file_hash", (q) => q.eq("fileHash", args.fileHash))
      .collect();

    const active = jobs
      .filter((job) => {
        if (job.status !== "queued" && job.status !== "processing") return false;
        if (job.updatedAt <= cutoff) return false;
        if (job.clerkUserId !== args.clerkUserId) return false;
        if (job.extractionMode !== args.extractionMode) return false;
        return job.extractionModel === args.extractionModel;
      })
      .sort((a, b) => a.createdAt - b.createdAt)[0];

    if (!active) return null;

    return {
      jobId: active.jobId,
      status: active.status,
      fileHash: active.fileHash,
      fileName: active.fileName,
      totalPages: active.totalPages,
      progressPagesProcessed: active.progressPagesProcessed,
    };
  },
});

export const claimQueuedExtractionJobForUpload = mutation({
  args: {
    secret: v.string(),
    extractionKey: v.string(),
    jobId: v.string(),
    ownerId: v.string(),
    uploadTraceId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    totalPages: v.number(),
    sourcePersistStartedAt: v.optional(v.number()),
    sourcePersistedAt: v.optional(v.number()),
    queuedAt: v.optional(v.number()),
    staleAfterMs: v.number(),
    retryCooldownMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const now = Date.now();
    const existing = await ctx.db
      .query("extractionJobs")
      .withIndex("by_extraction_key", (q) => q.eq("extractionKey", args.extractionKey))
      .first();

    if (existing) {
      if (
        existing.jobId === args.jobId &&
        (existing.status === "queued" || existing.status === "processing")
      ) {
        await ctx.db.patch(existing._id, {
          ownerId: args.ownerId,
          uploadTraceId: args.uploadTraceId,
          fileHash: args.fileHash,
          fileName: args.fileName,
          mimeType: args.mimeType,
          extractionMode: args.extractionMode,
          extractionModel: args.extractionModel,
          clerkUserId: args.clerkUserId,
          status: "processing",
          progressPagesProcessed: existing.progressPagesProcessed ?? 0,
          totalPages: args.totalPages,
          error: undefined,
          failureReason: undefined,
          sourcePersistStartedAt: args.sourcePersistStartedAt,
          sourcePersistedAt: args.sourcePersistedAt,
          updatedAt: now,
        });

        return {
          owner: true,
          status: "processing" as const,
          jobId: args.jobId,
        };
      }

      if (existing.status === "ready") {
        return {
          owner: false,
          status: "ready" as const,
          jobId: existing.jobId,
          failureReason: existing.failureReason,
        };
      }

      const stillActive =
        (existing.status === "queued" || existing.status === "processing") &&
        existing.updatedAt > now - args.staleAfterMs;
      if (stillActive) {
        return {
          owner: false,
          status: existing.status,
          jobId: existing.jobId,
          failureReason: existing.failureReason,
        };
      }

      const failedBecauseSameJobWasProcessing =
        existing.status === "failed" &&
        /extraction is already processing/i.test(existing.error ?? "");
      const failedRecently =
        existing.status === "failed" &&
        !failedBecauseSameJobWasProcessing &&
        existing.updatedAt > now - args.retryCooldownMs;
      if (failedRecently || isPermanentFailure(existing.failureReason)) {
        return {
          owner: false,
          status: "failed" as const,
          jobId: existing.jobId,
          failureReason: existing.failureReason,
          error: existing.error,
        };
      }

      await ctx.db.patch(existing._id, {
        jobId: args.jobId,
        ownerId: args.ownerId,
        uploadTraceId: args.uploadTraceId,
        fileHash: args.fileHash,
        fileName: args.fileName,
        mimeType: args.mimeType,
        extractionMode: args.extractionMode,
        extractionModel: args.extractionModel,
        clerkUserId: args.clerkUserId,
        status: "queued",
        progressPagesProcessed: 0,
        totalPages: args.totalPages,
        error: undefined,
        failureReason: undefined,
        sourcePersistStartedAt: args.sourcePersistStartedAt,
        sourcePersistedAt: args.sourcePersistedAt,
        queuedAt: args.queuedAt ?? now,
        workerClaimedAt: undefined,
        extractionStartedAt: undefined,
        extractionFinishedAt: undefined,
        readyAt: undefined,
        failedAt: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: now,
      });

      return {
        owner: true,
        status: "queued" as const,
        jobId: args.jobId,
      };
    }

    const existingJob = await ctx.db
      .query("extractionJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .first();

    const payload = {
      jobId: args.jobId,
      extractionKey: args.extractionKey,
      ownerId: args.ownerId,
      uploadTraceId: args.uploadTraceId,
      fileHash: args.fileHash,
      fileName: args.fileName,
      mimeType: args.mimeType,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      clerkUserId: args.clerkUserId,
      status: "queued",
      progressPagesProcessed: 0,
      totalPages: args.totalPages,
      sourcePersistStartedAt: args.sourcePersistStartedAt,
      sourcePersistedAt: args.sourcePersistedAt,
      queuedAt: args.queuedAt ?? now,
      workerClaimedAt: undefined,
      extractionStartedAt: undefined,
      extractionFinishedAt: undefined,
      readyAt: undefined,
      failedAt: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: now,
    } as const;

    if (existingJob) {
      await ctx.db.patch(existingJob._id, payload);
    } else {
      await ctx.db.insert("extractionJobs", {
        ...payload,
        createdAt: now,
      });
    }

    return {
      owner: true,
      status: "queued" as const,
      jobId: args.jobId,
    };
  },
});

export const claimExtractionJob = mutation({
  args: {
    secret: v.string(),
    extractionKey: v.string(),
    jobId: v.string(),
    ownerId: v.string(),
    uploadTraceId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    totalPages: v.number(),
    sourcePersistStartedAt: v.optional(v.number()),
    sourcePersistedAt: v.optional(v.number()),
    queuedAt: v.optional(v.number()),
    staleAfterMs: v.number(),
    retryCooldownMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const now = Date.now();
    const existing = await ctx.db
      .query("extractionJobs")
      .withIndex("by_extraction_key", (q) => q.eq("extractionKey", args.extractionKey))
      .first();

    if (existing) {
      if (
        existing.jobId === args.jobId &&
        (existing.status === "queued" || existing.status === "processing")
      ) {
        await ctx.db.patch(existing._id, {
          ownerId: args.ownerId,
          fileHash: args.fileHash,
          fileName: args.fileName,
          mimeType: args.mimeType,
          extractionMode: args.extractionMode,
          extractionModel: args.extractionModel,
          clerkUserId: args.clerkUserId,
          status: "processing",
          progressPagesProcessed: existing.progressPagesProcessed ?? 0,
          totalPages: args.totalPages,
          error: undefined,
          failureReason: undefined,
          sourcePersistStartedAt: args.sourcePersistStartedAt,
          sourcePersistedAt: args.sourcePersistedAt,
          workerClaimedAt: now,
          updatedAt: now,
        });

        return {
          owner: true,
          status: "processing" as const,
          jobId: args.jobId,
        };
      }

      if (existing.status === "ready") {
        return {
          owner: false,
          status: "ready" as const,
          jobId: existing.jobId,
          failureReason: existing.failureReason,
        };
      }

      const stillProcessing =
        (existing.status === "queued" || existing.status === "processing") &&
        existing.updatedAt > now - args.staleAfterMs;
      if (stillProcessing) {
        return {
          owner: false,
          status: "processing" as const,
          jobId: existing.jobId,
          failureReason: existing.failureReason,
        };
      }

      const failedBecauseSameJobWasProcessing =
        existing.status === "failed" &&
        /extraction is already processing/i.test(existing.error ?? "");
      const failedRecently =
        existing.status === "failed" &&
        !failedBecauseSameJobWasProcessing &&
        existing.updatedAt > now - args.retryCooldownMs;
      if (failedRecently || isPermanentFailure(existing.failureReason)) {
        return {
          owner: false,
          status: "failed" as const,
          jobId: existing.jobId,
          failureReason: existing.failureReason,
          error: existing.error,
        };
      }

      await ctx.db.patch(existing._id, {
        jobId: args.jobId,
        ownerId: args.ownerId,
        uploadTraceId: args.uploadTraceId,
        fileHash: args.fileHash,
        fileName: args.fileName,
        mimeType: args.mimeType,
        extractionMode: args.extractionMode,
        extractionModel: args.extractionModel,
        clerkUserId: args.clerkUserId,
        status: "processing",
        progressPagesProcessed: 0,
        totalPages: args.totalPages,
        error: undefined,
        failureReason: undefined,
        sourcePersistStartedAt: args.sourcePersistStartedAt,
        sourcePersistedAt: args.sourcePersistedAt,
        queuedAt: args.queuedAt ?? now,
        workerClaimedAt: undefined,
        extractionStartedAt: undefined,
        extractionFinishedAt: undefined,
        readyAt: undefined,
        failedAt: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: now,
      });

      return {
        owner: true,
        status: "processing" as const,
        jobId: args.jobId,
      };
    }

    const existingJob = await ctx.db
      .query("extractionJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .first();

    const payload = {
      jobId: args.jobId,
      extractionKey: args.extractionKey,
      ownerId: args.ownerId,
      uploadTraceId: args.uploadTraceId,
      fileHash: args.fileHash,
      fileName: args.fileName,
      mimeType: args.mimeType,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      clerkUserId: args.clerkUserId,
      status: "processing",
      progressPagesProcessed: 0,
      totalPages: args.totalPages,
      sourcePersistStartedAt: args.sourcePersistStartedAt,
      sourcePersistedAt: args.sourcePersistedAt,
      queuedAt: args.queuedAt ?? now,
      workerClaimedAt: undefined,
      extractionStartedAt: undefined,
      extractionFinishedAt: undefined,
      readyAt: undefined,
      failedAt: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: now,
    } as const;

    if (existingJob) {
      await ctx.db.patch(existingJob._id, payload);
    } else {
      await ctx.db.insert("extractionJobs", {
        ...payload,
        createdAt: now,
      });
    }

    return {
      owner: true,
      status: "processing" as const,
      jobId: args.jobId,
    };
  },
});

export const getPdfExtractionByUserAndFile = query({
  args: {
    secret: v.string(),
    clerkUserId: v.optional(v.string()),
    fileHash: v.string(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const row = args.clerkUserId
      ? await ctx.db
        .query("pdfExtractionRecords")
        .withIndex("by_clerk_user_file_hash", (q) =>
          q.eq("clerkUserId", args.clerkUserId).eq("fileHash", args.fileHash),
        )
        .first()
      : await ctx.db
        .query("pdfExtractionRecords")
        .withIndex("by_file_hash", (q) => q.eq("fileHash", args.fileHash))
        .first();

    if (!row) return null;

    return {
      ...row,
      payloadUrl: row.payloadR2Key
        ? await r2.getUrl(row.payloadR2Key, { expiresIn: 60 * 10 })
        : undefined,
    };
  },
});

export const upsertPdfExtraction = mutation({
  args: {
    secret: v.string(),
    clerkUserId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    appExtractionVersion: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
    mcqs: v.any(),
    sourceChunks: v.any(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const existing = args.clerkUserId
      ? await ctx.db
          .query("pdfExtractionRecords")
          .withIndex("by_clerk_user_file_hash", (q) =>
            q.eq("clerkUserId", args.clerkUserId).eq("fileHash", args.fileHash),
          )
          .first()
      : await ctx.db
          .query("pdfExtractionRecords")
          .withIndex("by_file_hash", (q) => q.eq("fileHash", args.fileHash))
          .first();

    const payload = {
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
      payloadStorage: "convex" as const,
      payloadR2Key: undefined,
      payloadSizeBytes: undefined,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("pdfExtractionRecords", {
      ...payload,
      createdAt: Date.now(),
    });
  },
});

export const upsertPdfExtractionPayload = action({
  args: {
    secret: v.string(),
    clerkUserId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    appExtractionVersion: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
    payloadBytes: v.bytes(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const r2Key = await r2.store(
      ctx,
      new Blob([args.payloadBytes], { type: EXTRACTION_PAYLOAD_MIME_TYPE }),
      {
        key: extractionPayloadR2Key({
          kind: "pdf-extraction",
          fileHash: args.fileHash,
          clerkUserId: args.clerkUserId,
        }),
        type: EXTRACTION_PAYLOAD_MIME_TYPE,
        cacheControl: "private, max-age=3600",
      },
    );

    await ctx.runMutation(internal.extractionStorage.upsertPdfExtractionR2Metadata, {
      clerkUserId: args.clerkUserId,
      fileHash: args.fileHash,
      fileName: args.fileName,
      pageCount: args.pageCount,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      appExtractionVersion: args.appExtractionVersion,
      title: args.title,
      summary: args.summary,
      payloadR2Key: r2Key,
      payloadSizeBytes: args.payloadBytes.byteLength,
    });

    return r2Key;
  },
});

export const upsertPdfExtractionR2Metadata = internalMutation({
  args: {
    clerkUserId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    appExtractionVersion: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
    payloadR2Key: v.string(),
    payloadSizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = args.clerkUserId
      ? await ctx.db
          .query("pdfExtractionRecords")
          .withIndex("by_clerk_user_file_hash", (q) =>
            q.eq("clerkUserId", args.clerkUserId).eq("fileHash", args.fileHash),
          )
          .first()
      : await ctx.db
          .query("pdfExtractionRecords")
          .withIndex("by_file_hash", (q) => q.eq("fileHash", args.fileHash))
          .first();

    const payload = {
      clerkUserId: args.clerkUserId,
      fileHash: args.fileHash,
      fileName: args.fileName,
      pageCount: args.pageCount,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      appExtractionVersion: args.appExtractionVersion,
      title: args.title,
      summary: args.summary,
      mcqs: undefined,
      sourceChunks: undefined,
      payloadStorage: "r2" as const,
      payloadR2Key: args.payloadR2Key,
      payloadSizeBytes: args.payloadSizeBytes,
      updatedAt: Date.now(),
    };

    if (existing) {
      if (existing.payloadR2Key && existing.payloadR2Key !== args.payloadR2Key) {
        await r2.deleteObject(ctx, existing.payloadR2Key);
      }
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("pdfExtractionRecords", {
      ...payload,
      createdAt: Date.now(),
    });
  },
});

export const getQuestionSource = query({
  args: {
    secret: v.string(),
    questionId: v.string(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const row = await ctx.db
      .query("questionSources")
      .withIndex("by_question_id", (q) => q.eq("questionId", args.questionId))
      .first();

    if (!row) return null;

    const imageUrl =
      row.previewR2Key
        ? (await r2.getUrl(row.previewR2Key, { expiresIn: 60 * 60 }).catch(() => null)) ??
          row.imageUrl
        : row.imageUrl;

    return {
      questionId: row.questionId,
      fileId: row.fileId,
      sourcePagePreviewId: row.sourcePagePreviewId,
      pageNumber: row.pageNumber,
      imageUrl,
      previewMimeType: row.previewMimeType,
      previewR2Key: row.previewR2Key,
      width: row.width,
      height: row.height,
      sourceRegion: row.sourceRegion,
      highlightConfirmed: row.highlightConfirmed,
    };
  },
});

export const getQuestionSourceForPage = query({
  args: {
    secret: v.string(),
    fileId: v.string(),
    pageNumber: v.number(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const rows = await ctx.db
      .query("questionSources")
      .withIndex("by_file_id", (q) => q.eq("fileId", args.fileId))
      .collect();
    const row = rows.find((item) => item.pageNumber === args.pageNumber);
    if (!row) return null;

    const imageUrl =
      row.previewR2Key
        ? (await r2.getUrl(row.previewR2Key, { expiresIn: 60 * 60 }).catch(() => null)) ??
          row.imageUrl
        : row.imageUrl;

    return {
      id: row.sourcePagePreviewId,
      fileId: row.fileId,
      pageNumber: row.pageNumber,
      imageUrl,
      previewMimeType: row.previewMimeType,
      previewR2Key: row.previewR2Key,
      width: row.width,
      height: row.height,
    };
  },
});

export const upsertQuestionSource = mutation({
  args: {
    secret: v.string(),
    questionId: v.string(),
    fileId: v.string(),
    sourcePagePreviewId: v.string(),
    pageNumber: v.number(),
    imageUrl: v.string(),
    previewMimeType: v.optional(v.string()),
    previewR2Key: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    sourceRegion: v.any(),
    highlightConfirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const existing = await ctx.db
      .query("questionSources")
      .withIndex("by_question_id", (q) => q.eq("questionId", args.questionId))
      .first();

    const payload = {
      questionId: args.questionId,
      fileId: args.fileId,
      sourcePagePreviewId: args.sourcePagePreviewId,
      pageNumber: args.pageNumber,
      imageUrl: args.imageUrl,
      previewMimeType: args.previewMimeType,
      previewR2Key: args.previewR2Key,
      width: args.width,
      height: args.height,
      sourceRegion: args.sourceRegion,
      highlightConfirmed: args.highlightConfirmed,
      updatedAt: Date.now(),
    };

    if (existing) {
      if (existing.previewR2Key && existing.previewR2Key !== args.previewR2Key) {
        const rowsWithSameFile = await ctx.db
          .query("questionSources")
          .withIndex("by_file_id", (q) => q.eq("fileId", existing.fileId))
          .collect();
        const keyStillReferenced = rowsWithSameFile.some(
          (row) =>
            row._id !== existing._id && row.previewR2Key === existing.previewR2Key,
        );
        if (!keyStillReferenced) {
          await r2.deleteObject(ctx, existing.previewR2Key);
        }
      }
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("questionSources", {
      ...payload,
      createdAt: Date.now(),
    });
  },
});

export const storeQuestionSourcePreview = action({
  args: {
    secret: v.string(),
    fileId: v.string(),
    sourcePagePreviewId: v.string(),
    pageNumber: v.number(),
    imageBytes: v.bytes(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const r2Key = await r2.store(ctx, new Blob([args.imageBytes], { type: "image/webp" }), {
      key: sourcePreviewR2Key(args),
      type: "image/webp",
      disposition: `inline; filename="page-${args.pageNumber}.webp"`,
      cacheControl: "private, max-age=3600",
    });

    const url = await r2.getUrl(r2Key, { expiresIn: 60 * 60 });
    return { r2Key, url };
  },
});

export const upsertExtractionPage = mutation({
  args: {
    secret: v.string(),
    jobId: v.string(),
    fileHash: v.string(),
    clerkUserId: v.optional(v.string()),
    pageIndex: v.number(),
    previewR2Key: v.optional(v.string()),
    imageBase64R2Key: v.optional(v.string()),
    text: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    complexity: v.optional(
      v.union(
        v.literal("text_selectable"),
        v.literal("normal_image"),
        v.literal("dense_image"),
        v.literal("noise"),
      ),
    ),
    puCost: v.optional(v.number()),
    mode: v.optional(
      v.union(
        v.literal("existing_questions"),
        v.literal("study_content"),
        v.literal("mixed"),
        v.literal("noise"),
      ),
    ),
    candidateQuestionCount: v.optional(v.number()),
    status: extractionPageStatus,
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const existing = await ctx.db
      .query("extractionPages")
      .withIndex("by_job_page", (q) =>
        q.eq("jobId", args.jobId).eq("pageIndex", args.pageIndex),
      )
      .first();

    const now = Date.now();
    const payload = {
      jobId: args.jobId,
      fileHash: args.fileHash,
      clerkUserId: args.clerkUserId,
      pageIndex: args.pageIndex,
      previewR2Key: args.previewR2Key,
      imageBase64R2Key: args.imageBase64R2Key,
      text: args.text,
      width: args.width,
      height: args.height,
      complexity: args.complexity,
      puCost: args.puCost,
      mode: args.mode,
      candidateQuestionCount: args.candidateQuestionCount,
      status: args.status,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("extractionPages", {
      ...payload,
      createdAt: now,
    });
  },
});

export const upsertExtractionPageAudit = mutation({
  args: {
    secret: v.string(),
    jobId: v.string(),
    fileHash: v.string(),
    pageIndex: v.number(),
    mode: v.optional(v.string()),
    candidateQuestionCount: v.number(),
    extractedQuestionCount: v.number(),
    generatedQuestionCount: v.number(),
    incompleteCount: v.number(),
    needsReviewCount: v.number(),
    retryCount: v.number(),
    status: pageAuditStatus,
    warnings: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const existing = await ctx.db
      .query("extractionPageAudits")
      .withIndex("by_job_page", (q) =>
        q.eq("jobId", args.jobId).eq("pageIndex", args.pageIndex),
      )
      .first();

    const now = Date.now();
    const payload = {
      jobId: args.jobId,
      fileHash: args.fileHash,
      pageIndex: args.pageIndex,
      mode: args.mode,
      candidateQuestionCount: args.candidateQuestionCount,
      extractedQuestionCount: args.extractedQuestionCount,
      generatedQuestionCount: args.generatedQuestionCount,
      incompleteCount: args.incompleteCount,
      needsReviewCount: args.needsReviewCount,
      retryCount: args.retryCount,
      status: args.status,
      warnings: args.warnings,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("extractionPageAudits", {
      ...payload,
      createdAt: now,
    });
  },
});

export const recoverStaleExtractionJobs = mutation({
  args: {
    secret: v.string(),
    staleAfterMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);
    return await recoverStaleJobsHandler(ctx, args.staleAfterMs);
  },
});

export const recoverStaleExtractionJobsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.EXTRACTION_CRONS_ENABLED !== "true") return { recovered: 0 };

    const staleAfterMs = Number(process.env.EXTRACTION_LOCK_STALE_AFTER_MS ?? 600_000);
    return await recoverStaleJobsHandler(
      ctx,
      Number.isFinite(staleAfterMs) ? staleAfterMs : 600_000,
    );
  },
});

async function recoverStaleJobsHandler(ctx: MutationCtx, staleAfterMs: number) {
  const now = Date.now();
  const cutoff = now - staleAfterMs;
  const queuedRows = await ctx.db
    .query("extractionJobs")
    .withIndex("by_status_updated", (q) =>
      q.eq("status", "queued").lt("updatedAt", cutoff),
    )
    .order("asc")
    .take(STALE_JOB_RECOVERY_BATCH_SIZE);
  const processingRows = await ctx.db
    .query("extractionJobs")
    .withIndex("by_status_updated", (q) =>
      q.eq("status", "processing").lt("updatedAt", cutoff),
    )
    .order("asc")
    .take(STALE_JOB_RECOVERY_BATCH_SIZE);
  const rows = [...queuedRows, ...processingRows]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, STALE_JOB_RECOVERY_BATCH_SIZE);
  let recovered = 0;

  for (const row of rows) {
    await ctx.db.patch(row._id, {
      status: "failed",
      failureReason: "worker_timeout",
      error:
        "Extraction took too long and was marked stale. Retry the upload or contact support if this keeps happening.",
      updatedAt: now,
    });
    recovered += 1;
  }

  return { recovered };
}
