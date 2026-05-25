import { isConvexStorageConfigured } from "@/lib/server-storage.server";

export async function storeSourceFileInConvex(args: {
  clerkUserId: string | null | undefined;
  fileHash: string;
  fileName: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
}): Promise<boolean> {
  if (!args.clerkUserId || args.clerkUserId.startsWith("anon:") || !isConvexStorageConfigured()) {
    return false;
  }

  const maxBytes = 15 * 1024 * 1024;
  if (args.arrayBuffer.byteLength > maxBytes) {
    return false;
  }

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const storageId = await client.action(api.sourceFiles.storeSourceFileFromServer, {
      secret: process.env.EXTRACTION_STORAGE_SECRET!,
      clerkUserId: args.clerkUserId,
      fileHash: args.fileHash,
      fileName: args.fileName,
      mimeType: args.mimeType,
      fileBytes: args.arrayBuffer,
    });
    return Boolean(storageId);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[source-file] Convex store failed:", error);
    }
    return false;
  }
}

export async function getConvexSourceFileUrl(args: {
  clerkUserId: string;
  fileHash: string;
}): Promise<{ url: string; fileName: string; mimeType: string } | null> {
  if (!isConvexStorageConfigured()) return null;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const row = await client.query(api.sourceFiles.getSourceFileUrlForUser, {
      secret: process.env.EXTRACTION_STORAGE_SECRET!,
      clerkUserId: args.clerkUserId,
      fileHash: args.fileHash,
    });
    if (!row?.url) return null;
    return {
      url: row.url,
      fileName: row.fileName,
      mimeType: row.mimeType,
    };
  } catch {
    return null;
  }
}
