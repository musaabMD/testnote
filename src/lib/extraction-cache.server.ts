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
    return {
      title: row.title,
      summary: row.summary,
      mcqs: row.mcqs,
      sourceChunks: row.sourceChunks,
      cachedAt: row.createdAt,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[extraction-cache] Convex read failed:", error);
    }
    return null;
  }
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

  if (isConvexStorageConfigured()) {
    await syncExtractionToConvex(key, payload, pageCount);
  } else if (!isDevelopmentStorageAllowed()) {
    throw new Error(
      "Cannot persist extraction cache in production without Convex storage.",
    );
  }

  await setLocalCachedExtraction(key, payload);
}
