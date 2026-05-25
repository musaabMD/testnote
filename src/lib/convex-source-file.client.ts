import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";

export async function uploadSourceFileToConvex(
  convex: ConvexReactClient,
  file: File,
  fileHash: string,
): Promise<boolean> {
  try {
    const { key, url } = await convex.mutation(api.sourceFiles.generateR2SourceUploadUrl, {
      fileHash,
      fileName: file.name,
    });
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!response.ok) {
      return false;
    }

    await convex.mutation(api.r2.syncMetadata, { key });
    await convex.mutation(api.sourceFiles.commitR2SourceFile, {
      fileHash,
      r2Key: key,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });

    return true;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[source-file] client Convex upload failed:", error);
    }
    return false;
  }
}

export async function fetchConvexSourceFileUrl(
  convex: ConvexReactClient,
  fileHash: string,
): Promise<{ url: string; fileName: string; mimeType: string } | null> {
  try {
    const row = await convex.query(api.sourceFiles.getSourceFileUrl, { fileHash });
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
