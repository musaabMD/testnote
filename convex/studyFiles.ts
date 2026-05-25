import { v } from "convex/values";
import { query } from "./_generated/server";

const extractionRecord = v.object({
  fileHash: v.string(),
  fileName: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  title: v.string(),
  summary: v.string(),
  mcqs: v.any(),
  sourceChunks: v.any(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function mapExtractionRecord(row: {
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  title: string;
  summary: string;
  mcqs: unknown;
  sourceChunks: unknown;
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

    return rows
      .map(mapExtractionRecord)
      .sort((a, b) => b.updatedAt - a.updatedAt);
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

    return row ? mapExtractionRecord(row) : null;
  },
});
