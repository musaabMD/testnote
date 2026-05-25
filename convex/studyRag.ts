import { openai } from "@ai-sdk/openai";
import { RAG } from "@convex-dev/rag";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action } from "./_generated/server";
import { rateLimiter } from "./rateLimits";

type StudyFilters = {
  fileHash: string;
};

type StudyMetadata = {
  fileName: string;
  source: "pdf" | "text" | "link" | "video";
};

export const studyRag = new RAG<StudyFilters, StudyMetadata>(components.rag, {
  textEmbeddingModel: openai.embedding(
    process.env.RAG_EMBEDDING_MODEL ?? "text-embedding-3-small",
  ),
  embeddingDimension: Number(process.env.RAG_EMBEDDING_DIMENSION ?? 1536),
  filterNames: ["fileHash"],
});

export const addStudyText = action({
  args: {
    fileHash: v.string(),
    fileName: v.string(),
    source: v.union(
      v.literal("pdf"),
      v.literal("text"),
      v.literal("link"),
      v.literal("video"),
    ),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    await rateLimiter.limit(ctx, "pdfExtract", {
      key: identity.subject,
      throws: true,
    });

    return await studyRag.add(ctx, {
      namespace: identity.subject,
      key: args.fileHash,
      title: args.fileName,
      text: args.text,
      filterValues: [{ name: "fileHash", value: args.fileHash }],
      metadata: {
        fileName: args.fileName,
        source: args.source,
      },
    });
  },
});

export const searchStudyText = action({
  args: {
    query: v.string(),
    fileHash: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    await rateLimiter.limit(ctx, "ragSearch", {
      key: identity.subject,
      throws: true,
    });

    return await studyRag.search(ctx, {
      namespace: identity.subject,
      query: args.query,
      limit: args.limit ?? 8,
      chunkContext: { before: 1, after: 1 },
      filters: args.fileHash
        ? [{ name: "fileHash", value: args.fileHash }]
        : undefined,
    });
  },
});
