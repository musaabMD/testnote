import type { SourceChunk } from "@/lib/highlightable-source";
import {
  hasAnswerKeySignal,
  hasQuestionIntent,
  normalizeLineForParsing,
} from "@/lib/mcq-line-patterns";
import type { MistralOcrPage } from "@/lib/mistral-ocr.server";
import type { PdfMcq, PdfMcqResult } from "@/lib/pdf-mcqs";
import { formatOptionText, formatQuestionText } from "@/lib/question-text";

type OcrQuestionBlock = {
  pageNumber: number;
  questionNumber: number;
  text: string;
};

export function extractMcqsFromMistralOcrPages(args: {
  pages: MistralOcrPage[];
  fileHash: string;
  fileName: string;
}): { result: PdfMcqResult; sourceChunks: SourceChunk[] } {
  const blocks = args.pages.flatMap((page) =>
    splitOcrPageIntoQuestionBlocks(pageText(page), page.index + 1),
  );

  const sourceChunks: SourceChunk[] = [];
  const mcqs: PdfMcq[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const parsed = parseQuestionBlock(block);
    if (!parsed) continue;

    const dedupeKey = questionDedupeKey(parsed.questionText, block.questionNumber);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const chunkId = `${args.fileHash}-ocr-p${block.pageNumber}-q${block.questionNumber || mcqs.length + 1}`;
    sourceChunks.push({
      id: chunkId,
      fileId: args.fileHash,
      pageNumber: block.pageNumber,
      text: block.text,
      region: {
        pageNumber: block.pageNumber,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceKind: "question-block",
        method: "ocr-fallback",
        confidence: 0.72,
      },
    });

    mcqs.push({
      ...parsed,
      sourceChunkIds: [chunkId],
      sourcePage: block.pageNumber,
      sourceRegion: {
        pageNumber: block.pageNumber,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceKind: "question-block",
        method: "ocr-fallback",
        confidence: 0.72,
      },
      exactQuote: block.text.slice(0, 240),
      rawJson: {
        provider: "mistral-ocr",
        extraction: "deterministic-numbered-question-parser",
      },
    });
  }

  return {
    result: {
      title: titleFromFileName(args.fileName),
      summary: `Extracted ${mcqs.length} OCR question${mcqs.length === 1 ? "" : "s"}.`,
      mcqs,
    },
    sourceChunks,
  };
}

function pageText(page: MistralOcrPage): string {
  return [page.header, page.markdown, page.footer]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

function splitOcrPageIntoQuestionBlocks(text: string, pageNumber: number): OcrQuestionBlock[] {
  const normalized = normalizeOcrText(text);
  if (!normalized) return [];

  const markers = Array.from(
    normalized.matchAll(
      /(?:^|\n)\s*(?:[-*]\s*)?(?:Q(?:uestion)?\.?\s*)?(\d{1,4})\s*[\.\):]\s*/gi,
    ),
  );
  if (!markers.length) return [];

  return markers
    .map((marker, index) => {
      const start = marker.index ?? 0;
      const next = markers[index + 1];
      const end = next?.index ?? normalized.length;
      const questionNumber = Number.parseInt(marker[1] ?? "", 10);
      const blockText = normalized.slice(start, end).trim();
      if (!Number.isFinite(questionNumber) || !blockLooksExtractable(blockText)) {
        return null;
      }
      return { pageNumber, questionNumber, text: blockText };
    })
    .filter((block): block is OcrQuestionBlock => Boolean(block));
}

function normalizeOcrText(text: string): string {
  const lines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) =>
      normalizeLineForParsing(
        line
          .replace(/<[^>]+>/g, " ")
          .replace(/^[#>*\-\s]+/, "")
          .replace(/\*\*/g, "")
          .replace(/`/g, ""),
      ),
    )
    .filter(Boolean);

  return lines
    .join("\n")
    .replace(/([^\n])\s+((?:Q(?:uestion)?\.?\s*)?\d{1,4}\s*[\.\):]\s+)/gi, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function blockLooksExtractable(text: string): boolean {
  const body = stripLeadingQuestionNumber(text);
  if (/^q(?:uestion)?$/i.test(body)) return true;
  if (body.length < 2) return false;
  if (hasQuestionIntent(body) || hasAnswerKeySignal(body)) return true;
  if (parseOptions(body).length > 0) return true;
  return /\b(?:scenario|case|patient|worker|pregnant|child|woman|man|screening|diagnosis|management|treatment|prevention|prophylaxis|vaccine|risk|bias|regression|survival|statin|htn|hiv|dengue|cholera|rabies|tb|tuberculosis|malaria|hepatitis)\b/i.test(
    body,
  );
}

function parseQuestionBlock(block: OcrQuestionBlock): PdfMcq | null {
  const withoutNumber = stripLeadingQuestionNumber(block.text);
  const options = parseOptions(withoutNumber);
  const optionStart = firstOptionIndex(withoutNumber);
  const stemRaw = optionStart >= 0 ? withoutNumber.slice(0, optionStart) : withoutNumber;
  const questionText = formatQuestionText(cleanStem(stemRaw));
  if (!questionText) return null;

  const correctAnswer = findCorrectAnswer(withoutNumber, options);
  const normalizedOptions = options.map((option) => ({
    label: option.label,
    text: formatOptionText(stripCorrectMarker(option.text)),
  }));

  return {
    questionNumber: block.questionNumber,
    questionText,
    options: normalizedOptions.length ? normalizedOptions : undefined,
    correctAnswer,
    notes: correctAnswer ? [] : ["Answer not clearly present in OCR source."],
    status:
      normalizedOptions.length >= 2 && correctAnswer
        ? "completed"
        : "needs_review",
  };
}

function stripLeadingQuestionNumber(text: string): string {
  return normalizeLineForParsing(text)
    .replace(/^(?:[-*]\s*)?(?:Q(?:uestion)?\.?\s*)?\d{1,4}\s*[\.\):]\s*/i, "")
    .trim();
}

function cleanStem(text: string): string {
  return normalizeLineForParsing(text)
    .replace(/\b(?:answer|correct answer|ans\.?)\s*[:.\-]\s*[A-E]\b.*$/i, "")
    .replace(/\((?:not sure|i think|don't remember|dont remember)[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOptions(text: string): Array<{ label: string; text: string }> {
  const normalized = normalizeLineForParsing(text);
  const matches = Array.from(
    normalized.matchAll(/(?:^|\s)([A-Ea-e])[\.\):\-]\s+(?=\S)/g),
  );
  if (!matches.length) return [];

  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end =
        index + 1 < matches.length
          ? matches[index + 1]!.index ?? normalized.length
          : normalized.length;
      const optionText = normalized.slice(start, end).trim();
      if (!optionText) return null;
      return {
        label: match[1]!.toUpperCase(),
        text: optionText,
      };
    })
    .filter((option): option is { label: string; text: string } => Boolean(option));
}

function firstOptionIndex(text: string): number {
  const match = normalizeLineForParsing(text).match(/(?:^|\s)[A-Ea-e][\.\):\-]\s+(?=\S)/);
  return match?.index ?? -1;
}

function findCorrectAnswer(
  text: string,
  options: Array<{ label: string; text: string }>,
): string {
  const normalized = normalizeLineForParsing(text);
  const explicit = normalized.match(
    /(?:correct answer|answer|ans\.?)\s*[:.\-]?\s*([A-E])\b/i,
  );
  if (explicit?.[1]) return explicit[1].toUpperCase();

  const marked = options.find((option) => /\bcorrect\b/i.test(option.text));
  return marked?.label ?? "";
}

function stripCorrectMarker(text: string): string {
  return text.replace(/\(?\s*correct\s*\)?/gi, "").replace(/\s+/g, " ").trim();
}

function questionDedupeKey(questionText: string | undefined, questionNumber: number): string {
  const normalized = normalizeLineForParsing(questionText ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || `q${questionNumber}`;
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || "OCR extracted questions";
}
