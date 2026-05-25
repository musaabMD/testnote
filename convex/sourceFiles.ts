import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { r2 } from "./r2";
import type { Id } from "./_generated/dataModel";

const MAX_SERVER_STORE_BYTES = 15 * 1024 * 1024;

function assertStorageSecret(secret: string) {
  const expected = process.env.EXTRACTION_STORAGE_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized source file request.");
  }
}

const sourceFileRecord = v.object({
  fileHash: v.string(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  storageProvider: v.optional(v.union(v.literal("convex"), v.literal("r2"))),
  url: v.union(v.string(), v.null()),
});

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96) || "unknown";
}

function fileExtension(fileName: string) {
  const match = fileName.match(/\.([a-zA-Z0-9]{1,12})$/);
  return match ? `.${match[1]!.toLowerCase()}` : "";
}

function sourceFileR2Key(args: {
  clerkUserId: string;
  fileHash: string;
  fileName: string;
}) {
  return [
    "users",
    safePathSegment(args.clerkUserId),
    "source-files",
    safePathSegment(args.fileHash),
    `original-${crypto.randomUUID()}${fileExtension(args.fileName)}`,
  ].join("/");
}

async function getSourceFileUrlForRow(
  ctx: { storage: { getUrl: (storageId: Id<"_storage">) => Promise<string | null> } },
  row: { storageId?: Id<"_storage">; r2Key?: string },
) {
  if (row.r2Key) {
    try {
      return await r2.getUrl(row.r2Key, { expiresIn: 60 * 60 });
    } catch {
      return null;
    }
  }

  if (row.storageId) {
    return await ctx.storage.getUrl(row.storageId);
  }

  return null;
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Sign in to upload files.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const generateR2SourceUploadUrl = mutation({
  args: {
    fileHash: v.string(),
    fileName: v.string(),
  },
  returns: v.object({
    key: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Sign in to upload files.");
    }

    return await r2.generateUploadUrl(
      sourceFileR2Key({
        clerkUserId: identity.subject,
        fileHash: args.fileHash,
        fileName: args.fileName,
      }),
    );
  },
});

export const commitSourceFile = mutation({
  args: {
    fileHash: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Sign in to upload files.");
    }

    const clerkUserId = identity.subject;
    const existing = await ctx.db
      .query("sourceFiles")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("fileHash", args.fileHash),
      )
      .first();

    const payload = {
      fileHash: args.fileHash,
      clerkUserId,
      storageProvider: "convex" as const,
      storageId: args.storageId,
      r2Key: undefined,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      updatedAt: Date.now(),
    };

    if (existing) {
      if (existing.storageId && existing.storageId !== args.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      if (existing.r2Key) {
        await r2.deleteObject(ctx, existing.r2Key);
      }
      await ctx.db.patch(existing._id, payload);
      return null;
    }

    await ctx.db.insert("sourceFiles", {
      ...payload,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const commitR2SourceFile = mutation({
  args: {
    fileHash: v.string(),
    r2Key: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Sign in to upload files.");
    }

    const clerkUserId = identity.subject;
    const existing = await ctx.db
      .query("sourceFiles")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("fileHash", args.fileHash),
      )
      .first();

    const payload = {
      fileHash: args.fileHash,
      clerkUserId,
      storageProvider: "r2" as const,
      storageId: undefined,
      r2Key: args.r2Key,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      updatedAt: Date.now(),
    };

    if (existing) {
      if (existing.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      if (existing.r2Key && existing.r2Key !== args.r2Key) {
        await r2.deleteObject(ctx, existing.r2Key);
      }
      await ctx.db.patch(existing._id, payload);
      return null;
    }

    await ctx.db.insert("sourceFiles", {
      ...payload,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getSourceFileUrl = query({
  args: { fileHash: v.string() },
  returns: v.union(sourceFileRecord, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const row = await ctx.db
      .query("sourceFiles")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", identity.subject).eq("fileHash", args.fileHash),
      )
      .first();

    if (!row) return null;

    const url = await getSourceFileUrlForRow(ctx, row);
    return {
      fileHash: row.fileHash,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      storageProvider: row.storageProvider,
      url,
    };
  },
});

export const getSourceFileUrlForUser = query({
  args: {
    secret: v.string(),
    clerkUserId: v.string(),
    fileHash: v.string(),
  },
  returns: v.union(sourceFileRecord, v.null()),
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    const row = await ctx.db
      .query("sourceFiles")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("fileHash", args.fileHash),
      )
      .first();

    if (!row) return null;

    const url = await getSourceFileUrlForRow(ctx, row);
    return {
      fileHash: row.fileHash,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      storageProvider: row.storageProvider,
      url,
    };
  },
});

export const storeSourceFileFromServer = action({
  args: {
    secret: v.string(),
    clerkUserId: v.string(),
    fileHash: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    fileBytes: v.bytes(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    assertStorageSecret(args.secret);

    if (!args.clerkUserId || args.fileBytes.byteLength > MAX_SERVER_STORE_BYTES) {
      return null;
    }

    const r2Key = await r2.store(ctx, new Blob([args.fileBytes], { type: args.mimeType }), {
      key: sourceFileR2Key(args),
      type: args.mimeType,
      disposition: `attachment; filename="${args.fileName.replace(/["\\]/g, "_")}"`,
      cacheControl: "private, max-age=3600",
    });

    await ctx.runMutation(internal.sourceFiles.upsertSourceFileRecord, {
      clerkUserId: args.clerkUserId,
      fileHash: args.fileHash,
      r2Key,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.fileBytes.byteLength,
    });

    return r2Key;
  },
});

export const upsertSourceFileRecord = internalMutation({
  args: {
    clerkUserId: v.string(),
    fileHash: v.string(),
    r2Key: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sourceFiles")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("fileHash", args.fileHash),
      )
      .first();

    const payload = {
      fileHash: args.fileHash,
      clerkUserId: args.clerkUserId,
      storageProvider: "r2" as const,
      storageId: undefined,
      r2Key: args.r2Key,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      updatedAt: Date.now(),
    };

    if (existing) {
      if (existing.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      if (existing.r2Key && existing.r2Key !== args.r2Key) {
        await r2.deleteObject(ctx, existing.r2Key);
      }
      await ctx.db.patch(existing._id, payload);
      return null;
    }

    await ctx.db.insert("sourceFiles", {
      ...payload,
      createdAt: Date.now(),
    });
    return null;
  },
});
