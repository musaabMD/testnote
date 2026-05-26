import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

function assertStorageSecret(secret: string) {
  const expected = process.env.EXTRACTION_STORAGE_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized extraction storage request.");
  }
}

const extractionJobStatus = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

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
      createdAt: Date.now(),
    };

    if (existing) {
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
      updatedAt: number;
    } = {
      jobId: args.jobId,
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

export const claimExtractionJob = mutation({
  args: {
    secret: v.string(),
    extractionKey: v.string(),
    jobId: v.string(),
    ownerId: v.string(),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    totalPages: v.number(),
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

      const failedRecently =
        existing.status === "failed" &&
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
      fileHash: args.fileHash,
      fileName: args.fileName,
      mimeType: args.mimeType,
      extractionMode: args.extractionMode,
      extractionModel: args.extractionModel,
      clerkUserId: args.clerkUserId,
      status: "processing",
      progressPagesProcessed: 0,
      totalPages: args.totalPages,
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

    if (args.clerkUserId) {
      return await ctx.db
        .query("pdfExtractionRecords")
        .withIndex("by_clerk_user_file_hash", (q) =>
          q.eq("clerkUserId", args.clerkUserId).eq("fileHash", args.fileHash),
        )
        .first();
    }

    return await ctx.db
      .query("pdfExtractionRecords")
      .withIndex("by_file_hash", (q) => q.eq("fileHash", args.fileHash))
      .first();
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

    return {
      questionId: row.questionId,
      fileId: row.fileId,
      sourcePagePreviewId: row.sourcePagePreviewId,
      pageNumber: row.pageNumber,
      imageUrl: row.imageUrl,
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

    return {
      id: row.sourcePagePreviewId,
      fileId: row.fileId,
      pageNumber: row.pageNumber,
      imageUrl: row.imageUrl,
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
      width: args.width,
      height: args.height,
      sourceRegion: args.sourceRegion,
      highlightConfirmed: args.highlightConfirmed,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("questionSources", {
      ...payload,
      createdAt: Date.now(),
    });
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
  const rows = await ctx.db.query("extractionJobs").collect();
  let recovered = 0;

  for (const row of rows) {
    const stuck =
      (row.status === "queued" || row.status === "processing") &&
      row.updatedAt < cutoff;
    if (!stuck) continue;

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
