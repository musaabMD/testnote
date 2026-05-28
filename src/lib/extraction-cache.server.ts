import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type ExtractionCacheKey,
  extractionCacheKeyId,
} from "@/lib/extraction-config";
import type { PdfMcqResult } from "@/lib/pdf-mcqs";
import type { SourceChunk } from "@/lib/highlightable-source";
import {
  assertProductionServerStorage,
  isConvexStorageConfigured,
  isDevelopmentStorageAllowed,
} from "@/lib/server-storage.server";

export type CachedExtractionPayload = {
  title: string;
  summary: string;
  mcqs: PdfMcqResult["mcqs"];
  sourceChunks: SourceChunk[];
  cachedAt: number;
};

const CACHE_DIR = path.join(process.cwd(), ".data", "extraction-cache");
const CONVEX_DOCUMENT_SAFE_BYTES = 800 * 1024;

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cacheFilePath(key: ExtractionCacheKey): string {
  const id = extractionCacheKeyId(key);
  return path.join(CACHE_DIR, `${id.replace(/[^a-zA-Z0-9:_-]/g, "_")}.json`);
}

async function getLocalCachedExtraction(
  key: ExtractionCacheKey,
): Promise<CachedExtractionPayload | null> {
  if (!isDevelopmentStorageAllowed()) return null;

  try {
    const raw = await readFile(cacheFilePath(key), "utf8");
    const parsed = JSON.parse(raw) as CachedExtractionPayload;
    if (!parsed?.mcqs || !Array.isArray(parsed.mcqs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function setLocalCachedExtraction(
  key: ExtractionCacheKey,
  payload: Omit<CachedExtractionPayload, "cachedAt">,
): Promise<void> {
  if (!isDevelopmentStorageAllowed()) return;

  await ensureCacheDir();
  const record: CachedExtractionPayload = {
    ...payload,
    cachedAt: Date.now(),
  };
  await writeFile(cacheFilePath(key), JSON.stringify(record), "utf8");
}

async function getConvexCachedExtraction(
  key: ExtractionCacheKey,
): Promise<CachedExtractionPayload | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.EXTRACTION_STORAGE_SECRET;
  if (!convexUrl || !secret) return null;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(convexUrl);
    const row = await client.query(api.extractionStorage.getFileCache, {
      secret,
      fileHash: key.fileHash,
      extractionMode: key.extractionMode,
      extractionModel: key.extractionModel,
      appExtractionVersion: key.appExtractionVersion,
      promptVersion: key.promptVersion,
      schemaVersion: key.schemaVersion,
      renderVersion: key.renderVersion,
    });
    if (!row) return null;
    const payload =
      Array.isArray(row.mcqs)
        ? row
        : row.payloadUrl
          ? await fetchExtractionPayload(row.payloadUrl)
          : null;
    if (!payload?.mcqs || !Array.isArray(payload.mcqs)) return null;
    return {
      title: payload.title ?? row.title,
      summary: payload.summary ?? row.summary,
      mcqs: payload.mcqs,
      sourceChunks: payload.sourceChunks ?? [],
      cachedAt: row.createdAt,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[extraction-cache] Convex read failed:", error);
    }
    return null;
  }
}

async function fetchExtractionPayload(url: string): Promise<Partial<CachedExtractionPayload> | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as Partial<CachedExtractionPayload> | null;
}

async function syncExtractionToConvex(
  key: ExtractionCacheKey,
  payload: Omit<CachedExtractionPayload, "cachedAt">,
  pageCount: number,
): Promise<void> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.EXTRACTION_STORAGE_SECRET;
  if (!convexUrl || !secret) return;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(convexUrl);
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));
  const payloadBytes = encodedPayload.buffer.slice(
    encodedPayload.byteOffset,
    encodedPayload.byteOffset + encodedPayload.byteLength,
  ) as ArrayBuffer;

  if (encodedPayload.byteLength > CONVEX_DOCUMENT_SAFE_BYTES) {
    await client.action(api.extractionStorage.upsertFileCachePayload, {
      secret,
      fileHash: key.fileHash,
      extractionMode: key.extractionMode,
      extractionModel: key.extractionModel,
      appExtractionVersion: key.appExtractionVersion,
      promptVersion: key.promptVersion,
      schemaVersion: key.schemaVersion,
      renderVersion: key.renderVersion,
      pageCount,
      title: payload.title,
      summary: payload.summary,
      payloadBytes,
    });
    return;
  }

  await client.mutation(api.extractionStorage.upsertFileCache, {
    secret,
    fileHash: key.fileHash,
    extractionMode: key.extractionMode,
    extractionModel: key.extractionModel,
    appExtractionVersion: key.appExtractionVersion,
    promptVersion: key.promptVersion,
    schemaVersion: key.schemaVersion,
    renderVersion: key.renderVersion,
    pageCount,
    title: payload.title,
    summary: payload.summary,
    mcqs: payload.mcqs,
    sourceChunks: payload.sourceChunks,
  });
}

export async function lookupExtractionCache(
  key: ExtractionCacheKey,
): Promise<CachedExtractionPayload | null> {
  assertProductionServerStorage();

  const fromConvex = await getConvexCachedExtraction(key);
  if (fromConvex) return fromConvex;

  return getLocalCachedExtraction(key);
}

export async function persistExtractionCache(
  key: ExtractionCacheKey,
  payload: Omit<CachedExtractionPayload, "cachedAt">,
  pageCount: number,
): Promise<void> {
  assertProductionServerStorage();

  await setLocalCachedExtraction(key, payload);

  if (isConvexStorageConfigured()) {
    await syncExtractionToConvex(key, payload, pageCount);
  } else if (!isDevelopmentStorageAllowed()) {
    throw new Error(
      "Cannot persist extraction cache in production without Convex storage.",
    );
  }
}
