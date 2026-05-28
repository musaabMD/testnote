import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDevelopmentStorageAllowed } from "@/lib/server-storage.server";

export type MistralOcrDimensions = {
  width: number;
  height: number;
  dpi?: number;
};

export type MistralOcrPage = {
  /** 0-based page index from Mistral */
  index: number;
  /** Markdown text content extracted from the page */
  markdown: string;
  /** Header text (present when extract_header was enabled) */
  header?: string;
  /** Footer text (present when extract_footer was enabled) */
  footer?: string;
  /** Page pixel dimensions */
  dimensions?: MistralOcrDimensions;
  /** Page-level OCR confidence score 0–1 */
  confidence_score?: number;
};

export type MistralOcrResult = {
  fileHash: string;
  fileName: string;
  /** ISO timestamp of when the OCR was run and cached */
  cachedAt: string;
  pages: MistralOcrPage[];
};

const OCR_DIR = path.join(process.cwd(), ".data", "ocr-pages");

async function ensureOcrDir(): Promise<void> {
  if (!isDevelopmentStorageAllowed()) return;
  await mkdir(OCR_DIR, { recursive: true });
}

function ocrFilePath(fileHash: string): string {
  return path.join(OCR_DIR, `${fileHash}.json`);
}

/** Returns true if MISTRAL_OCR_API_KEY is set in the environment. */
export function isMistralOcrAvailable(): boolean {
  return Boolean(process.env.MISTRAL_OCR_API_KEY);
}

async function readOcrCache(fileHash: string): Promise<MistralOcrResult | null> {
  if (!isDevelopmentStorageAllowed()) return null;
  try {
    const raw = await readFile(ocrFilePath(fileHash), "utf8");
    return JSON.parse(raw) as MistralOcrResult;
  } catch {
    return null;
  }
}

async function writeOcrCache(result: MistralOcrResult): Promise<void> {
  if (!isDevelopmentStorageAllowed()) return;
  await ensureOcrDir();
  await writeFile(
    ocrFilePath(result.fileHash),
    JSON.stringify(result, null, 2),
    "utf8",
  );
}

async function callMistralOcrApi(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): Promise<MistralOcrPage[]> {
  const apiKey = process.env.MISTRAL_OCR_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_OCR_API_KEY is not set");

  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_base64",
        document_base64: base64,
        document_name: fileName,
      },
      table_format: "html",
      extract_header: true,
      extract_footer: true,
      confidence_scores_granularity: "page",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "(unreadable)");
    throw new Error(`Mistral OCR API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { pages?: MistralOcrPage[] };
  const pages = data.pages;
  if (!Array.isArray(pages)) {
    throw new Error("Mistral OCR API response missing pages array");
  }

  return pages;
}

/**
 * Run Mistral OCR on a PDF buffer, caching results per fileHash so each file
 * is only sent to the API once. Returns null on any failure so callers can
 * gracefully fall back to the full-file multimodal path.
 *
 * In development the result is stored under `.data/ocr-pages/{fileHash}.json`.
 * In production the cache is skipped (stateless serverless); the result is
 * returned and used for the current request only.
 */
export async function runMistralOcr(
  arrayBuffer: ArrayBuffer,
  fileHash: string,
  fileName: string,
): Promise<MistralOcrResult | null> {
  // Check dev-only on-disk cache first
  const cached = await readOcrCache(fileHash);
  if (cached) {
    console.info("[mistral-ocr] cache hit", {
      fileHash,
      pageCount: cached.pages.length,
    });
    return cached;
  }

  console.info("[mistral-ocr] calling API", { fileHash, fileName });

  try {
    const pages = await callMistralOcrApi(arrayBuffer, fileName);
    const result: MistralOcrResult = {
      fileHash,
      fileName,
      cachedAt: new Date().toISOString(),
      pages,
    };
    await writeOcrCache(result);
    console.info("[mistral-ocr] OCR complete", {
      fileHash,
      pageCount: pages.length,
    });
    return result;
  } catch (error) {
    console.error("[mistral-ocr] API call failed", {
      fileHash,
      error: String(error),
    });
    return null;
  }
}
