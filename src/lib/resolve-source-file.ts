import type { PdfSource } from "@/lib/pdf-mcqs";
import { createObjectUrlForSourceFile, getSourceFile, saveSourceFile } from "@/lib/pdf-source-store";
import { fetchConvexSourceFileUrl, uploadSourceFileToConvex } from "@/lib/convex-source-file.client";
import type { ConvexReactClient } from "convex/react";

export type ResolvedSourceFile = {
  url: string;
  mimeType: string;
  name: string;
  source: PdfSource;
};

type StoredSourceFile = {
  data: ArrayBuffer;
  mimeType: string;
  name: string;
};

async function fetchSourceFileFromApi(
  fileId: string,
): Promise<{ url: string; fileName: string; mimeType: string } | null> {
  try {
    const response = await fetch(`/api/pdf/source-file?fileId=${encodeURIComponent(fileId)}`);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      url?: string;
      fileName?: string;
      mimeType?: string;
    };
    if (!payload.fileName) return null;
    return {
      url: `/api/pdf/source-file/download?fileId=${encodeURIComponent(fileId)}`,
      fileName: payload.fileName ?? "source.pdf",
      mimeType: payload.mimeType ?? "application/pdf",
    };
  } catch {
    return null;
  }
}

async function cacheRemoteSourceFile(
  fileId: string,
  remote: { url: string; fileName: string; mimeType: string },
): Promise<ResolvedSourceFile | null> {
  try {
    const response = await fetch(remote.url);
    if (!response.ok) {
      return {
        url: remote.url,
        mimeType: remote.mimeType,
        name: remote.fileName,
        source: {
          name: remote.fileName,
          url: remote.url,
          previewUrl: remote.url,
          mimeType: remote.mimeType,
        },
      };
    }

    const buffer = await response.arrayBuffer();
    const blob = new Blob([buffer], { type: remote.mimeType });
    const file = new File([buffer], remote.fileName, { type: remote.mimeType });
    await saveSourceFile(fileId, file);
    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      mimeType: remote.mimeType,
      name: remote.fileName,
      source: {
        name: remote.fileName,
        url: objectUrl,
        previewUrl: objectUrl,
        mimeType: remote.mimeType,
      },
    };
  } catch {
    return {
      url: remote.url,
      mimeType: remote.mimeType,
      name: remote.fileName,
      source: {
        name: remote.fileName,
        url: remote.url,
        previewUrl: remote.url,
        mimeType: remote.mimeType,
      },
    };
  }
}

async function uploadLocalSourceFileIfMissing(
  convex: ConvexReactClient,
  fileId: string,
  local: StoredSourceFile,
) {
  const remote = await fetchConvexSourceFileUrl(convex, fileId);
  if (remote?.url) return;

  const file = new File([local.data], local.name, { type: local.mimeType });
  await uploadSourceFileToConvex(convex, file, fileId);
}

export async function syncMissingSourceFilesFromConvex(
  fileIds: string[],
  options?: { convex?: ConvexReactClient },
): Promise<void> {
  if (typeof window === "undefined") return;

  await Promise.all(
    fileIds.map(async (fileId) => {
      const local = await getSourceFile(fileId);
      const remote = options?.convex
        ? await fetchConvexSourceFileUrl(options.convex, fileId)
        : null;

      if (!remote?.url && local && options?.convex) {
        const file = new File([local.data], local.name, { type: local.mimeType });
        await uploadSourceFileToConvex(options.convex, file, fileId);
      }

      if (local) return;

      const sourceFile = remote ?? (await fetchSourceFileFromApi(fileId));
      if (!sourceFile?.url) return;
      await cacheRemoteSourceFile(fileId, sourceFile);
    }),
  );
}

export async function resolveSourceFileForViewing(
  fileId: string,
  source: PdfSource,
  options?: { convex?: ConvexReactClient },
): Promise<ResolvedSourceFile | null> {
  const localUrl = await createObjectUrlForSourceFile(fileId);
  if (localUrl) {
    const stored = await getSourceFile(fileId);
    if (stored && options?.convex) {
      void uploadLocalSourceFileIfMissing(options.convex, fileId, stored).catch(() => {});
    }

    return {
      url: localUrl,
      mimeType: stored?.mimeType ?? source.mimeType ?? "application/pdf",
      name: stored?.name ?? source.name,
      source: {
        ...source,
        url: localUrl,
        previewUrl: localUrl,
        mimeType: stored?.mimeType ?? source.mimeType,
        name: stored?.name ?? source.name,
      },
    };
  }

  const remote =
    (options?.convex
      ? await fetchConvexSourceFileUrl(options.convex, fileId)
      : null) ?? (await fetchSourceFileFromApi(fileId));

  if (remote?.url) {
    const cached = await cacheRemoteSourceFile(fileId, remote);
    if (cached) {
      return {
        ...cached,
        source: {
          ...source,
          ...cached.source,
        },
      };
    }
  }

  const previewUrl = source.previewUrl ?? source.url;
  if (previewUrl) {
    return {
      url: previewUrl,
      mimeType: source.mimeType ?? "application/pdf",
      name: source.name,
      source,
    };
  }

  return null;
}
