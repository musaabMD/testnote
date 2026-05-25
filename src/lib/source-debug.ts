import type { SourceChunk } from "@/lib/highlightable-source";
import { parseLeadingQuestionNumber } from "@/lib/mcq-line-patterns";

export const SOURCE_DEBUG_STORAGE_KEY = "testnote:debug-source-regions";

/** Internal QA only — never shown to end users unless explicitly enabled. */
export function isSourceDebugAvailable() {
  return process.env.NEXT_PUBLIC_SOURCE_DEBUG === "1";
}

export function isSourceDebugEnabled() {
  if (!isSourceDebugAvailable()) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOURCE_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSourceDebugEnabled(enabled: boolean) {
  if (!isSourceDebugAvailable() || typeof window === "undefined") return;
  window.localStorage.setItem(SOURCE_DEBUG_STORAGE_KEY, enabled ? "1" : "0");
}

export function toggleSourceDebugEnabled() {
  const next = !isSourceDebugEnabled();
  setSourceDebugEnabled(next);
  return next;
}

export function filterChunksForPage(chunks: SourceChunk[], pageNumber: number) {
  return chunks.filter((chunk) => chunk.pageNumber === pageNumber);
}

export function previewChunkText(text: string, maxLength = 40) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

function regionsMatch(
  a: SourceChunk["region"],
  b: { x: number; y: number; width: number; height: number },
) {
  const epsilon = 0.002;
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}

export function findChunkForQuestion(
  pageChunks: SourceChunk[],
  options?: {
    sourceChunkIds?: string[];
    sourceRegion?: { x: number; y: number; width: number; height: number } | null;
    questionNumber?: number;
  },
): string | undefined {
  const { sourceChunkIds, sourceRegion, questionNumber } = options ?? {};

  if (sourceChunkIds?.length) {
    const byId = pageChunks.find((chunk) => sourceChunkIds.includes(chunk.id));
    if (byId) return byId.id;
  }

  if (sourceRegion) {
    const byRegion = pageChunks.find((chunk) => regionsMatch(chunk.region, sourceRegion));
    if (byRegion) return byRegion.id;
  }

  if (questionNumber !== undefined) {
    const byNumber = pageChunks.find(
      (chunk) => parseLeadingQuestionNumber(chunk.text) === questionNumber,
    );
    if (byNumber) return byNumber.id;
  }

  return undefined;
}
