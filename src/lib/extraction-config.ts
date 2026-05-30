import type { ExtractionMode } from "@/lib/quiz-settings";

/** Bump when extraction logic/prompts change to invalidate cache entries. */
export const APP_EXTRACTION_VERSION = "15";
export const EXTRACTION_PROMPT_VERSION = "p10-source-explanations";
export const EXTRACTION_SCHEMA_VERSION = "s3-page-audit-source-first";
export const EXTRACTION_RENDER_VERSION = "r1";

export function parseExtractionMode(value: FormDataEntryValue | null): ExtractionMode {
  if (
    value === "extract-only" ||
    value === "extract-and-generate" ||
    value === "choices-provided" ||
    value === "make-choices"
  ) {
    return value;
  }
  return "make-choices";
}

export function shouldAutoFixGrammar(): boolean {
  const value = process.env.OPENROUTER_AUTO_GRAMMAR_FIX?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isFullFileMultimodalFallbackEnabled(): boolean {
  const value = process.env.ENABLE_FULL_FILE_MULTIMODAL_FALLBACK?.toLowerCase();
  if (value === "0" || value === "false" || value === "no") return false;
  return true;
}

export function isPdfOcrRouteEnabled(): boolean {
  const value = process.env.ENABLE_PDF_OCR_ROUTE?.toLowerCase();
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return process.env.NODE_ENV === "development";
}

export function getMaxChunksPerBatch(): number {
  const raw = process.env.MAX_CHUNKS_PER_BATCH;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
}

export function getMaxPagesPerBatch(): number {
  const raw = process.env.MAX_PAGES_PER_BATCH;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

export function getMaxInputCharsPerBatch(): number {
  const raw = process.env.MAX_INPUT_CHARS_PER_BATCH;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

export type ExtractionCacheKey = {
  fileHash: string;
  extractionMode: ExtractionMode;
  extractionModel: string;
  appExtractionVersion: string;
  promptVersion: string;
  schemaVersion: string;
  renderVersion: string;
};

export function buildExtractionCacheKey(
  fileHash: string,
  extractionMode: ExtractionMode,
  extractionModel: string,
): ExtractionCacheKey {
  return {
    fileHash,
    extractionMode,
    extractionModel,
    appExtractionVersion: APP_EXTRACTION_VERSION,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    renderVersion: EXTRACTION_RENDER_VERSION,
  };
}

export function extractionCacheKeyId(key: ExtractionCacheKey): string {
  return [
    key.fileHash,
    key.extractionMode,
    key.extractionModel,
    key.appExtractionVersion,
    key.promptVersion,
    key.schemaVersion,
    key.renderVersion,
  ].join(":");
}
