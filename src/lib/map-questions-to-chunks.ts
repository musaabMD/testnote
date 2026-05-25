import type { SourceChunk } from "@/lib/highlightable-source";
import { parseLeadingQuestionNumber } from "@/lib/mcq-line-patterns";
import type { PdfMcq } from "@/lib/pdf-mcqs";

function normalizeForMatch(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTextOverlap(a: string, b: string) {
  const wordsA = normalizeForMatch(a).split(/\s+/).filter(Boolean).slice(0, 8);
  const wordsB = normalizeForMatch(b).split(/\s+/).filter(Boolean);
  if (!wordsA.length || !wordsB.length) return 0;

  let matched = 0;
  for (const word of wordsA) {
    if (wordsB.some((candidate) => candidate.includes(word) || word.includes(candidate))) {
      matched += 1;
    }
  }
  return matched / wordsA.length;
}

export function findBestChunkForQuestion(question: PdfMcq, chunks: SourceChunk[], index: number) {
  const questionNumber = question.questionNumber ?? index + 1;
  const questionText = question.questionText ?? question.question ?? "";

  const byNumber = chunks.find((chunk) => parseLeadingQuestionNumber(chunk.text) === questionNumber);
  if (byNumber) return byNumber;

  let best: { chunk: SourceChunk; score: number } | null = null;
  for (const chunk of chunks) {
    const score = scoreTextOverlap(questionText, chunk.text);
    if (score < 0.35) continue;
    if (!best || score > best.score) {
      best = { chunk, score };
    }
  }

  return best?.chunk ?? null;
}

export function mapQuestionsToSourceChunks(mcqs: PdfMcq[], chunks: SourceChunk[]): PdfMcq[] {
  return mcqs.map((question, index) => {
    const chunk = findBestChunkForQuestion(question, chunks, index);
    if (!chunk) return question;

    return {
      ...question,
      sourcePage: chunk.pageNumber,
      sourceRegion: chunk.region,
      sourceChunkIds: [chunk.id],
    };
  });
}
