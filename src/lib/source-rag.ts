import type { SourceChunk, SourceRegion } from "@/lib/highlightable-source";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";

export type RagSourceChunk = {
  id: string;
  fileId: string;
  fileName: string;
  pageNumber: number;
  text: string;
  citation: string;
  region?: SourceRegion;
};

export type RagRetrievalResult = {
  context: string;
  sources: RagSourceChunk[];
};

const MAX_CONTEXT_CHARS = 4_800;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "into",
  "main",
  "more",
  "most",
  "that",
  "the",
  "their",
  "there",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

export function buildRagSourceChunks(
  file: Pick<PdfFileQueueItem, "id" | "name" | "sourceChunks">,
): RagSourceChunk[] {
  return (file.sourceChunks ?? [])
    .filter((chunk) => chunk.text.trim().length > 0)
    .map((chunk) => normalizeSourceChunk(file.id, file.name, chunk));
}

export function buildRagDocumentText(chunks: RagSourceChunk[]): string {
  return chunks
    .map((chunk) => `[${chunk.citation}]\n${chunk.text}`)
    .join("\n\n");
}

export function rankRagSourceChunks(
  chunks: RagSourceChunk[],
  query: string,
  limit = 6,
): RagSourceChunk[] {
  const queryTerms = tokenize(query);
  if (!queryTerms.length) return chunks.slice(0, limit);

  return chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, queryTerms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}

export function formatRagContext(chunks: RagSourceChunk[]): string {
  let used = 0;
  const blocks: string[] = [];

  for (const chunk of chunks) {
    const block = `Source ${blocks.length + 1} (${chunk.citation}):\n${chunk.text}`;
    if (used + block.length > MAX_CONTEXT_CHARS && blocks.length > 0) break;
    blocks.push(block);
    used += block.length;
  }

  return blocks.join("\n\n");
}

export function getLocalRagRetrieval(
  file: Pick<PdfFileQueueItem, "id" | "name" | "ragSourceChunks" | "sourceChunks">,
  query: string,
): RagRetrievalResult {
  const chunks = file.ragSourceChunks?.length
    ? file.ragSourceChunks
    : buildRagSourceChunks(file);
  const sources = rankRagSourceChunks(chunks, query);
  return {
    context: formatRagContext(sources),
    sources,
  };
}

function normalizeSourceChunk(
  fileId: string,
  fileName: string,
  chunk: SourceChunk,
): RagSourceChunk {
  const pageNumber = chunk.pageNumber || chunk.region.pageNumber || 1;
  return {
    id: chunk.id,
    fileId,
    fileName,
    pageNumber,
    text: chunk.text.trim().replace(/\s+/g, " "),
    citation: `${fileName}, page ${pageNumber}`,
    region: chunk.region,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
}

function scoreChunk(chunk: RagSourceChunk, queryTerms: string[]): number {
  const text = chunk.text.toLowerCase();
  let score = 0;

  for (const term of queryTerms) {
    if (!text.includes(term)) continue;
    score += term.length >= 6 ? 3 : 1;
  }

  return score;
}
