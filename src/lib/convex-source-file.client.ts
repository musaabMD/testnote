"use client";

import type { ConvexReactClient } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";

const MAX_CONVEX_CLIENT_UPLOAD_BYTES = 15 * 1024 * 1024;

export function sourceFileDownloadPath(fileHash: string) {
  return `/api/pdf/source-file/download?fileId=${encodeURIComponent(fileHash)}`;
}

export async function uploadSourceFileToConvex(
  convex: ConvexReactClient,
  file: File,
  fileHash: string,
): Promise<boolean> {
  try {
    const r2Upload = await convex.mutation(api.sourceFiles.generateR2SourceUploadUrl, {
      fileHash,
      fileName: file.name,
    });
    const r2Response = await fetch(r2Upload.url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (r2Response.ok) {
      await convex.mutation(api.r2.syncMetadata, { key: r2Upload.key });
      await convex.mutation(api.sourceFiles.commitR2SourceFile, {
        fileHash,
        r2Key: r2Upload.key,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      return true;
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[source-file] client R2 upload failed:", error);
    }
  }

  if (file.size > MAX_CONVEX_CLIENT_UPLOAD_BYTES) {
    return false;
  }

  try {
    const uploadUrl = await convex.mutation(api.sourceFiles.generateUploadUrl, {});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!response.ok) return false;

    const payload = (await response.json()) as { storageId?: string };
    if (!payload.storageId) {
      return false;
    }

    await convex.mutation(api.sourceFiles.commitSourceFile, {
      fileHash,
      storageId: payload.storageId as Id<"_storage">,
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
    if (!row) return null;
    return {
      url: sourceFileDownloadPath(fileHash),
      fileName: row.fileName,
      mimeType: row.mimeType,
    };
  } catch {
    return null;
  }
}
