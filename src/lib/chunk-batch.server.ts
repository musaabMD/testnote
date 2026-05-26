import {
  getMaxChunksPerBatch,
  getMaxInputCharsPerBatch,
  getMaxPagesPerBatch,
} from "@/lib/extraction-config";
import type { SourceChunk } from "@/lib/highlightable-source";

export type ChunkBatch = {
  batchIndex: number;
  chunks: SourceChunk[];
};

export function splitChunksIntoBatches(chunks: SourceChunk[]): ChunkBatch[] {
  if (!chunks.length) return [];

  const maxChunks = getMaxChunksPerBatch();
  const maxChars = getMaxInputCharsPerBatch();
  const maxPages = getMaxPagesPerBatch();
  const batches: ChunkBatch[] = [];
  let current: SourceChunk[] = [];
  let currentChars = 0;
  let currentPages = new Set<number>();

  for (const chunk of chunks) {
    const chunkChars = chunk.text.length + chunk.id.length + 32;
    const nextPages = new Set(currentPages);
    nextPages.add(chunk.pageNumber);
    const wouldExceedChunks = current.length >= maxChunks;
    const wouldExceedPages =
      current.length > 0 && nextPages.size > maxPages;
    const wouldExceedChars =
      current.length > 0 && currentChars + chunkChars > maxChars;

    if (wouldExceedChunks || wouldExceedPages || wouldExceedChars) {
      batches.push({ batchIndex: batches.length, chunks: current });
      current = [];
      currentChars = 0;
      currentPages = new Set<number>();
    }

    current.push(chunk);
    currentChars += chunkChars;
    currentPages.add(chunk.pageNumber);
  }

  if (current.length) {
    batches.push({ batchIndex: batches.length, chunks: current });
  }

  return batches;
}
