import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { r2 } from "./r2";

const extractionRecord = v.object({
  fileHash: v.string(),
  fileName: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  title: v.string(),
  summary: v.string(),
  mcqs: v.optional(v.any()),
  sourceChunks: v.optional(v.any()),
  payloadUrl: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function mapExtractionRecord(row: {
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  title: string;
  summary: string;
  mcqs?: unknown;
  sourceChunks?: unknown;
  payloadR2Key?: string;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    fileHash: row.fileHash,
    fileName: row.fileName,
    pageCount: row.pageCount,
    title: row.title,
    summary: row.summary,
    mcqs: row.mcqs,
    sourceChunks: row.sourceChunks,
    payloadUrl: row.payloadR2Key
      ? await r2.getUrl(row.payloadR2Key, { expiresIn: 60 * 10 })
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const listMyExtractions = query({
  args: {},
  returns: v.array(extractionRecord),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const rows = await ctx.db
      .query("pdfExtractionRecords")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .collect();

    return (await Promise.all(rows.map(mapExtractionRecord))).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  },
});

export const getMyExtraction = query({
  args: { fileHash: v.string() },
  returns: v.union(extractionRecord, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const row = await ctx.db
      .query("pdfExtractionRecords")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", identity.subject).eq("fileHash", args.fileHash),
      )
      .first();

    return row ? await mapExtractionRecord(row) : null;
  },
});

export const deleteMyExtraction = mutation({
  args: { fileHash: v.string() },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { deleted: false };

    const row = await ctx.db
      .query("pdfExtractionRecords")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", identity.subject).eq("fileHash", args.fileHash),
      )
      .first();

    if (row) {
      if (row.payloadR2Key) {
        await r2.deleteObject(ctx, row.payloadR2Key).catch(() => {});
      }
      await ctx.db.delete(row._id);
    }

    const sourceRows = await ctx.db
      .query("sourceFiles")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", identity.subject).eq("fileHash", args.fileHash),
      )
      .collect();

    for (const source of sourceRows) {
      if (source.storageId) {
        await ctx.storage.delete(source.storageId).catch(() => {});
      }
      if (source.r2Key) {
        await r2.deleteObject(ctx, source.r2Key).catch(() => {});
      }
      await ctx.db.delete(source._id);
    }

    const questionSources = await ctx.db
      .query("questionSources")
      .withIndex("by_file_id", (q) => q.eq("fileId", args.fileHash))
      .collect();

    for (const source of questionSources) {
      if (source.previewR2Key) {
        await r2.deleteObject(ctx, source.previewR2Key).catch(() => {});
      }
      await ctx.db.delete(source._id);
    }

    return { deleted: Boolean(row || sourceRows.length || questionSources.length) };
  },
});
