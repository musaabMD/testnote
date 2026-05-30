import type { SourceChunk } from "@/lib/highlightable-source";
import {
  hasAnswerKeySignal,
  hasQuestionIntent,
  isOptionLine,
  normalizeLineForParsing,
  parseLeadingQuestionNumber,
} from "@/lib/mcq-line-patterns";
import type { MistralOcrPage } from "@/lib/mistral-ocr.server";
import type { PdfMcq, PdfMcqResult } from "@/lib/pdf-mcqs";
import { formatOptionText, formatQuestionText } from "@/lib/question-text";

type OcrQuestionBlock = {
  pageNumber: number;
  questionNumber: number;
  text: string;
  parser: "numbered" | "recall";
};

export function extractMcqsFromMistralOcrPages(args: {
  pages: MistralOcrPage[];
  fileHash: string;
  fileName: string;
}): { result: PdfMcqResult; sourceChunks: SourceChunk[] } {
  const blocks = splitOcrPagesIntoQuestionBlocks(args.pages);

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
        extraction:
          block.parser === "recall"
            ? "deterministic-recall-question-parser"
            : "deterministic-numbered-question-parser",
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

function splitOcrPagesIntoQuestionBlocks(pages: MistralOcrPage[]): OcrQuestionBlock[] {
  const pageRecords = pages.map((page) => {
    const pageNumber = page.index + 1;
    const normalized = normalizeOcrText(pageText(page));
    return {
      pageNumber,
      normalized,
      blocks: splitOcrPageIntoQuestionBlocks(normalized, pageNumber),
    };
  });

  for (let index = 0; index < pageRecords.length - 1; index += 1) {
    const current = pageRecords[index]!;
    const next = pageRecords[index + 1]!;
    const lastBlock = current.blocks.at(-1);
    if (!lastBlock || !blockCanContinueAcrossPage(lastBlock)) continue;

    const continuationLines = leadingContinuationOptionLines(next.normalized);
    if (continuationLines.length < 2) continue;

    lastBlock.text = `${lastBlock.text}\n${continuationLines.join("\n")}`.trim();
  }

  return pageRecords.flatMap((page) => page.blocks);
}

function splitOcrPageIntoQuestionBlocks(text: string, pageNumber: number): OcrQuestionBlock[] {
  const normalized = normalizeOcrText(text);
  if (!normalized) return [];

  const numberedBlocks = splitNumberedQuestionBlocks(normalized, pageNumber);
  const recallBlocks = splitRecallQuestionBlocks(normalized, pageNumber);
  const blocks =
    recallBlocks.length >= numberedBlocks.length && recallBlocks.length > 0
      ? recallBlocks
      : [...numberedBlocks, ...recallBlocks];
  const seen = new Set<string>();
  return blocks.filter((block) => {
    const key = questionDedupeKey(stripLeadingQuestionNumber(block.text), block.questionNumber);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function blockCanContinueAcrossPage(block: OcrQuestionBlock): boolean {
  const body = stripLeadingQuestionNumber(block.text);
  if (!hasQuestionIntent(body)) return false;
  if (hasAnswerKeySignal(body)) return false;

  const labeledOptions = parseOptions(body);
  if (labeledOptions.length >= 4) return false;

  const unlabeledOptions = parseUnlabeledOptions(body);
  return unlabeledOptions.length < 4;
}

function leadingContinuationOptionLines(normalized: string): string[] {
  const lines = normalized.split("\n").map(normalizeLineForParsing).filter(Boolean);
  const continuation: string[] = [];
  let sawContent = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!sawContent && isIgnorableRecallLine(line)) continue;
    sawContent = true;

    if (looksLikeRecallQuestionStart(lines, index)) break;
    if (!isOptionLine(line) && !isLikelyUnlabeledOption(line)) break;

    continuation.push(line);
    if (continuation.length >= 6) break;
  }

  return continuation;
}

function splitNumberedQuestionBlocks(
  normalized: string,
  pageNumber: number,
): OcrQuestionBlock[] {
  const markers = Array.from(
    normalized.matchAll(
      /(?:^|\n)\s*(?:[-*]\s*)?(?:Q(?:uestion)?\.?\s*)?(\d{1,4})\s*[\.\):\-]\s*/gi,
    ),
  );
  if (!markers.length) return [];

  return markers
    .map((marker, index): OcrQuestionBlock | null => {
      const start = marker.index ?? 0;
      const next = markers[index + 1];
      const end = next?.index ?? normalized.length;
      const questionNumber = Number.parseInt(marker[1] ?? "", 10);
      const blockText = normalized.slice(start, end).trim();
      if (!Number.isFinite(questionNumber) || !blockLooksExtractable(blockText)) {
        return null;
      }
      return { pageNumber, questionNumber, text: blockText, parser: "numbered" };
    })
    .filter((block): block is OcrQuestionBlock => block !== null);
}

function splitRecallQuestionBlocks(
  normalized: string,
  pageNumber: number,
): OcrQuestionBlock[] {
  const lines = normalized.split("\n").map(normalizeLineForParsing).filter(Boolean);
  const starts: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (looksLikeRecallQuestionStart(lines, index)) {
      const previousStart = starts.at(-1);
      if (
        previousStart !== undefined &&
        shouldContinuePreviousRecallStart(lines, previousStart, index)
      ) {
        continue;
      }
      starts.push(index);
    }
  }

  return starts
    .map((startIndex, index): OcrQuestionBlock | null => {
      const nextStart = starts[index + 1] ?? lines.length;
      const blockLines = lines.slice(startIndex, nextStart);
      const text = blockLines.join("\n").trim();
      if (!blockLooksExtractable(text)) return null;
      return {
        pageNumber,
        questionNumber: parseLeadingQuestionNumber(blockLines[0]!) ?? index + 1,
        text,
        parser: "recall",
      };
    })
    .filter((block): block is OcrQuestionBlock => block !== null);
}

function shouldContinuePreviousRecallStart(
  lines: string[],
  previousStart: number,
  candidateIndex: number,
): boolean {
  if (candidateIndex - previousStart > 3) return false;

  const between = lines.slice(previousStart + 1, candidateIndex);
  if (between.some((line) => isOptionLine(line) || isLikelyUnlabeledOption(line))) {
    return false;
  }

  const previousLine = lines[previousStart]!;
  return looksLikeClinicalQuestionLead(
    previousLine,
    lines.slice(previousStart + 1, candidateIndex + 4),
  );
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
    .replace(/([.!?])\s+((?:Q(?:uestion)?\.?\s*)?\d{1,4}\s*[\.\):]\s+)/gi, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function blockLooksExtractable(text: string): boolean {
  const body = stripLeadingQuestionNumber(text);
  if (/^q(?:uestion)?$/i.test(body)) return true;
  if (body.length < 2) return false;
  if (hasQuestionIntent(body) || hasAnswerKeySignal(body)) return true;
  if (parseOptions(body).length > 0) return true;
  if (parseUnlabeledOptions(body).length >= 2) return true;
  return /\b(?:scenario|case|patient|worker|pregnant|child|woman|man|screening|diagnosis|management|treatment|prevention|prophylaxis|vaccine|risk|bias|regression|survival|statin|htn|hiv|dengue|cholera|rabies|tb|tuberculosis|malaria|hepatitis)\b/i.test(
    body,
  );
}

function looksLikeRecallQuestionStart(lines: string[], index: number): boolean {
  const line = lines[index]!;
  if (isIgnorableRecallLine(line)) return false;
  if (isOptionLine(line)) return false;
  if (looksLikeClinicalQuestionLead(line, lines.slice(index + 1, index + 7))) return true;
  if (isLikelyUnlabeledOption(line)) return false;

  const questionNumber = parseLeadingQuestionNumber(line);
  if (questionNumber !== null && blockLooksExtractable(line)) return true;
  if (hasQuestionIntent(line)) return true;

  const nextLines = lines.slice(index + 1, index + 7);
  const nextOptionCount = nextLines.filter(isLikelyUnlabeledOption).length;
  if (nextOptionCount < 2) return false;

  return /\b(?:patient|pt|woman|man|male|female|boy|girl|child|newborn|neonate|infant|pregnant|pregg|worker|doctor|nurse|history|present|presents|came|coming|with|diagnosed|cancer|trauma|fever|pain|syndrome|assessment|screening|transmitted|responsible|expected|initial|next|best|most|asking)\b/i.test(
    line,
  );
}

function looksLikeClinicalQuestionLead(line: string, nextLines: string[]): boolean {
  const normalized = normalizeLineForParsing(line);
  if (normalized.split(/\s+/).length < 6) return false;
  if (
    !/\b(?:patient|pt|woman|man|male|female|boy|girl|child|newborn|neonate|infant|pregnant|worker|doctor|nurse|underwent|develops|reveals|history|presents|came|coming|diagnosed|trauma|fever|pain|jaundice|chills)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }

  const lookaheadText = nextLines.join(" ");
  if (hasQuestionIntent(`${normalized} ${lookaheadText}`)) return true;
  return nextLines.slice(0, 6).filter(isLikelyUnlabeledOption).length >= 2;
}

function isIgnorableRecallLine(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  if (!normalized) return true;
  if (hasAnswerKeySignal(normalized)) return true;
  if (/^(?:page|slide)\s+\d+$/i.test(normalized)) return true;
  if (
    /^(?:#\s*)?(?:april|may|june|july|august|september|october|november|december)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }
  if (
    /^(?:tried to remember|the missing questions|wish you|good luck|telegram|alhomrani:)/i.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
}

function isLikelyUnlabeledOption(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  if (!normalized || normalized.length > 90) return false;
  if (isOptionLine(normalized)) return false;
  if (hasQuestionIntent(normalized)) return false;
  if (/^(?:and|or|but)\s+(?:another|just|the)\b/i.test(normalized)) return true;
  if (/^(?:less than|more than|high|low|normal|decreased|increased)\b/i.test(normalized)) {
    return true;
  }
  if (/^[A-Za-z0-9][A-Za-z0-9%/.,+\-\s()]{1,88}$/.test(normalized)) return true;
  return /[\u0600-\u06ff]/.test(normalized) && normalized.length <= 90;
}

function parseQuestionBlock(block: OcrQuestionBlock): PdfMcq | null {
  const withoutNumber = stripLeadingQuestionNumber(block.text);
  const labeledOptions = parseOptions(withoutNumber);
  const options = labeledOptions.length ? labeledOptions : parseUnlabeledOptions(withoutNumber);
  const optionStart = labeledOptions.length ? firstOptionIndex(withoutNumber) : -1;
  const stemRaw = optionStart >= 0
    ? withoutNumber.slice(0, optionStart)
    : stemFromUnlabeledBlock(withoutNumber);
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

function parseUnlabeledOptions(text: string): Array<{ label: string; text: string }> {
  const lines = text.split("\n").map(normalizeLineForParsing).filter(Boolean);
  const optionStart = firstUnlabeledOptionLineIndex(lines);
  if (optionStart < 0) return [];

  const options: Array<{ label: string; text: string }> = [];
  for (let index = optionStart; index < lines.length && options.length < 5; index += 1) {
    const line = stripCorrectMarker(lines[index]!);
    if (hasAnswerKeySignal(line)) break;
    if (!isLikelyUnlabeledOption(line)) continue;
    options.push({
      label: String.fromCharCode(65 + options.length),
      text: line,
    });
  }

  return options;
}

function firstUnlabeledOptionLineIndex(lines: string[]): number {
  const questionMarkIndex = lines.findIndex((line) => /\?/.test(line));
  if (questionMarkIndex >= 0) {
    const optionStart = questionMarkIndex + 1;
    const optionCount = lines.slice(optionStart, optionStart + 6).filter(isLikelyUnlabeledOption)
      .length;
    return optionCount >= 2 ? optionStart : -1;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const optionCount = lines.slice(index, index + 6).filter(isLikelyUnlabeledOption).length;
    if (optionCount >= 2) return index;
  }

  return -1;
}

function stemFromUnlabeledBlock(text: string): string {
  const lines = text.split("\n").map(normalizeLineForParsing).filter(Boolean);
  const optionStart = firstUnlabeledOptionLineIndex(lines);
  if (optionStart < 0) return text;
  return lines.slice(0, optionStart).join(" ");
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
