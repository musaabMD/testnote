import type { SourceChunk, SourceRegion } from "@/lib/highlightable-source";
import {
  hasQuestionIntent,
  hasMcqOptionSequence,
  isMcqBlockBoundaryLine,
  isOptionLine,
  normalizeLineForParsing,
  parseLeadingQuestionNumber,
  parseStandaloneQuestionNumberLine,
  trimMcqBlockEndIndex,
} from "@/lib/mcq-line-patterns";
import { getServerPdfJs, loadServerPdfDocument } from "@/lib/pdfjs-node.server";

type TextItemLike = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type PositionedItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextLine = {
  text: string;
  items: PositionedItem[];
  y: number;
};

export type SourcePagePack = {
  documentId?: string;
  pageNumber: number;
  pageText: string;
  blocks: SourceChunk[];
};

/** In-process chunk extraction — used by the PDF subprocess, not Next.js routes directly. */
export async function extractSourceChunksFromPdfInProcess(
  pdfBytes: ArrayBuffer,
  fileId?: string,
): Promise<SourceChunk[]> {
  const pdf = await loadServerPdfDocument(pdfBytes);
  const pdfjs = await getServerPdfJs();
  const chunks: SourceChunk[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const positioned = await getPositionedTextItems(page, viewport, pdfjs.Util);
    const columnItemGroups = splitItemsByColumn(positioned, viewport.width);
    let pageBlockIndex = 0;

    for (const columnItems of columnItemGroups) {
      const lines = groupIntoLines(columnItems);
      const pageChunks = chunkQuestionBlocks(
        lines,
        pageNumber,
        viewport.width,
        viewport.height,
      );

      for (const chunk of pageChunks) {
        pageBlockIndex += 1;
        chunks.push({
          id: `p${pageNumber}_b${pageBlockIndex}`,
          fileId,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
          region: chunk.region,
        });
      }
    }
  }

  return chunks;
}

export async function extractSourcePagePacksFromPdfInProcess(
  pdfBytes: ArrayBuffer,
  fileId?: string,
): Promise<SourcePagePack[]> {
  const pdf = await loadServerPdfDocument(pdfBytes);
  const pdfjs = await getServerPdfJs();
  const pages: SourcePagePack[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const positioned = await getPositionedTextItems(page, viewport, pdfjs.Util);
    const columnItemGroups = splitItemsByColumn(positioned, viewport.width);
    const pageLines = columnItemGroups.flatMap((columnItems) => groupIntoLines(columnItems));
    const sortedLines = pageLines.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 4) return yDiff;
      const aX = Math.min(...a.items.map((item) => item.x));
      const bX = Math.min(...b.items.map((item) => item.x));
      return aX - bX;
    });
    const blocks: SourceChunk[] = [];

    for (const line of sortedLines) {
      const block = blockLinesToChunk(
        [line],
        pageNumber,
        viewport.width,
        viewport.height,
        0.85,
      );
      if (!block) continue;
      blocks.push({
        id: `p${pageNumber}_b${blocks.length + 1}`,
        fileId,
        pageNumber,
        text: block.text,
        region: {
          ...block.region,
          sourceKind: "text-line",
        },
      });
    }

    pages.push({
      documentId: fileId,
      pageNumber,
      pageText: sortedLines
        .map((line) => line.text)
        .join("\n")
        .replace(/[ \t]+/g, " ")
        .trim(),
      blocks,
    });
  }

  return pages;
}

function findQuestionStartIndexes(lines: TextLine[]): number[] {
  const questionStarts: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lineLooksLikeNumberedQuestionStart(lines, index)) {
      questionStarts.push(index);
    }
  }

  return questionStarts;
}

function lineLooksLikeNumberedQuestionStart(lines: TextLine[], index: number): boolean {
  const line = lines[index]!;
  const hasQuestionNumber =
    parseLeadingQuestionNumber(line.text) !== null ||
    parseStandaloneQuestionNumberLine(line.text) !== null;

  if (!hasQuestionNumber) return false;

  const lookahead: TextLine[] = [];
  for (
    let lookaheadIndex = index;
    lookaheadIndex < lines.length && lookaheadIndex < index + 10;
    lookaheadIndex += 1
  ) {
    if (lookaheadIndex > index && isOptionBlockBoundary(lines[lookaheadIndex]!.text)) {
      break;
    }
    lookahead.push(lines[lookaheadIndex]!);
  }
  const lookaheadText = lookahead.map((entry) => entry.text).join(" ");
  if (hasQuestionIntent(lookaheadText)) return true;

  const optionStart = lookahead.findIndex((entry) => isOptionLine(entry.text, "A"));
  return optionStart >= 0 && hasMcqOptionSequence(lookahead, optionStart);
}

/** question start → next question start, including image gaps between stem and options. */
function chunkQuestionBlocks(
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Array<{ pageNumber: number; text: string; region: SourceRegion }> {
  const candidates: Array<{ pageNumber: number; text: string; region: SourceRegion }> = [];
  const questionStarts = findQuestionStartIndexes(lines);
  if (questionStarts.length > 0) {
    candidates.push(
      ...chunkByQuestionStarts(
        lines,
        questionStarts,
        pageNumber,
        pageWidth,
        pageHeight,
      ),
    );
  }

  candidates.push(...chunkByOptionBlocks(lines, pageNumber, pageWidth, pageHeight));
  candidates.push(
    ...chunkByInlineNumberedBlocks(lines, pageNumber, pageWidth, pageHeight),
  );

  const deduped = dedupeChunkCandidates(candidates);
  if (deduped.length > 0) {
    return deduped;
  }

  return chunkWholePage(lines, pageNumber, pageWidth, pageHeight);
}

function chunkByQuestionStarts(
  lines: TextLine[],
  questionStarts: number[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Array<{ pageNumber: number; text: string; region: SourceRegion }> {
  const chunks: Array<{ pageNumber: number; text: string; region: SourceRegion }> = [];

  for (let q = 0; q < questionStarts.length; q += 1) {
    const startIndex = questionStarts[q]!;
    const rawEndIndex =
      q + 1 < questionStarts.length ? questionStarts[q + 1]! - 1 : lines.length - 1;
    const endIndex = trimMcqBlockEndIndex(lines, startIndex, rawEndIndex);
    const blockLines = lines.slice(startIndex, endIndex + 1);
    const chunk = blockLinesToChunk(blockLines, pageNumber, pageWidth, pageHeight);
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

/** Fallback when stems are not numbered: chunk from A)… through D) option blocks. */
function chunkByOptionBlocks(
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Array<{ pageNumber: number; text: string; region: SourceRegion }> {
  const chunks: Array<{ pageNumber: number; text: string; region: SourceRegion }> = [];
  let cursor = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (index < cursor) continue;
    if (!isOptionLine(lines[index]!.text, "A")) continue;

    let startIndex = index;
    for (let back = index - 1; back >= 0 && back >= index - 14; back -= 1) {
      const lineText = lines[back]!.text;
      if (parseLeadingQuestionNumber(lineText) !== null) break;
      if (isOptionBlockBoundary(lineText)) {
        startIndex = back + 1;
        break;
      }
      if (isOptionLine(lineText, "D") || isOptionLine(lineText, "E")) break;
      startIndex = back;
    }

    if (!hasQuestionOptionBlock(lines, startIndex, index)) continue;

    let endIndex = index;
    for (let forward = index; forward < lines.length && forward < index + 20; forward += 1) {
      if (isOptionLine(lines[forward]!.text)) {
        endIndex = forward;
      }
      if (isOptionLine(lines[forward]!.text, "D") || isOptionLine(lines[forward]!.text, "E")) {
        endIndex = forward;
        break;
      }
    }

    endIndex = trimMcqBlockEndIndex(lines, startIndex, endIndex);

    const blockLines = lines.slice(startIndex, endIndex + 1);
    const chunk = blockLinesToChunk(blockLines, pageNumber, pageWidth, pageHeight, 0.75);
    if (chunk) {
      chunks.push(chunk);
      cursor = endIndex + 1;
      index = endIndex;
    }
  }

  return chunks;
}

function chunkByInlineNumberedBlocks(
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Array<{ pageNumber: number; text: string; region: SourceRegion }> {
  const fullText = lines
    .map((line) => line.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!fullText) return [];

  const markers = Array.from(
    fullText.matchAll(/(?:^|\s)(?:Q(?:uestion)?\.?\s*)?(\d{1,4})\s*[\.\):\-]\s+(?=\S)/gi),
  );
  if (markers.length < 2) return [];

  return markers
    .map((marker, index) => {
      const start = marker.index ?? 0;
      const end =
        index + 1 < markers.length ? markers[index + 1]!.index ?? fullText.length : fullText.length;
      const text = fullText.slice(start, end).trim();
      if (!inlineQuestionCandidateLooksValid(text)) return null;
      return textToChunk(text, lines, pageNumber, pageWidth, pageHeight, 0.5);
    })
    .filter(
      (chunk): chunk is { pageNumber: number; text: string; region: SourceRegion } =>
        Boolean(chunk),
    );
}

function hasQuestionOptionBlock(
  lines: TextLine[],
  startIndex: number,
  optionStartIndex: number,
): boolean {
  if (hasMcqOptionSequence(lines, optionStartIndex)) return true;

  const labels = new Set<string>();
  for (
    let index = optionStartIndex;
    index < lines.length && index < optionStartIndex + 8;
    index += 1
  ) {
    const match = lines[index]!.text.match(/^\s*\(?([A-Ea-e])[\.\):\-]/);
    if (match?.[1]) labels.add(match[1].toUpperCase());
  }

  if (!labels.has("A") || !labels.has("B")) return false;

  const stemText = lines
    .slice(startIndex, optionStartIndex)
    .map((line) => line.text)
    .join(" ");

  return hasQuestionIntent(stemText);
}

function isOptionBlockBoundary(text: string): boolean {
  const normalized = text.trim();
  return (
    !normalized ||
    /^-{5,}$/.test(normalized) ||
    isMcqBlockBoundaryLine(normalized)
  );
}

/** Last-resort fallback: one chunk per page/column when MCQ-like content is present. */
function chunkWholePage(
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Array<{ pageNumber: number; text: string; region: SourceRegion }> {
  if (!pageLooksLikeMcqContent(lines)) return [];

  const chunk = blockLinesToChunk(lines, pageNumber, pageWidth, pageHeight, 0.55);
  return chunk ? [chunk] : [];
}

function pageLooksLikeMcqContent(lines: TextLine[]): boolean {
  let optionLines = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (lineLooksLikeNumberedQuestionStart(lines, index)) return true;
    if (isOptionLine(line.text)) optionLines += 1;
  }

  return optionLines >= 2 && hasQuestionIntent(lines.map((line) => line.text).join(" "));
}

function inlineQuestionCandidateLooksValid(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  if (!normalized || normalized.length < 20) return false;
  if (hasQuestionIntent(normalized)) return true;

  const optionLabels = new Set<string>();
  for (const match of normalized.matchAll(/(?:^|\s)([A-Ea-e])[\.\):\-]\s+\S/g)) {
    optionLabels.add(match[1]!.toUpperCase());
  }
  return optionLabels.has("A") && optionLabels.has("B") && (optionLabels.has("C") || optionLabels.has("D"));
}

function dedupeChunkCandidates(
  chunks: Array<{ pageNumber: number; text: string; region: SourceRegion }>,
): Array<{ pageNumber: number; text: string; region: SourceRegion }> {
  const deduped: Array<{ pageNumber: number; text: string; region: SourceRegion }> = [];

  for (const chunk of chunks) {
    const normalized = normalizeChunkText(chunk.text);
    if (!normalized) continue;

    const duplicateIndex = deduped.findIndex((existing) => {
      if (existing.pageNumber !== chunk.pageNumber) return false;
      return textContainmentScore(normalized, normalizeChunkText(existing.text)) >= 0.82;
    });

    if (duplicateIndex < 0) {
      deduped.push(chunk);
      continue;
    }

    if (questionBlockScore(chunk.text) > questionBlockScore(deduped[duplicateIndex]!.text)) {
      deduped[duplicateIndex] = chunk;
    }
  }

  return deduped.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.region.y - b.region.y;
  });
}

function questionBlockScore(text: string) {
  const optionCount = Array.from(text.matchAll(/(?:^|\s)[A-Ea-e][\.\):\-]\s+\S/g)).length;
  const normalized = normalizeLineForParsing(text);
  const questionMarkerCount = Array.from(
    normalized.matchAll(/(?:^|\s)(?:Q(?:uestion)?\.?\s*)?\d{1,4}\s*[\.\):\-]\s+(?=\S)/gi),
  ).length;
  const startsWithOption = /^[A-Ea-e][\.\):\-]\s+\S/.test(normalized);
  const hasBoundary = /\b(?:answer|correct answer|ans\.?|notes?|explanation)\s*[:.\-]/i.test(
    normalized,
  );

  return (
    Math.min(text.length, 300) +
    optionCount * 100 +
    (hasQuestionIntent(text) ? 400 : 0) +
    (parseLeadingQuestionNumber(text) !== null ? 1000 : 0) -
    (startsWithOption ? 700 : 0) -
    (hasBoundary ? 800 : 0) -
    Math.max(0, questionMarkerCount - 1) * 1200
  );
}

function normalizeChunkText(text: string) {
  return normalizeLineForParsing(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textContainmentScore(a: string, b: string) {
  if (!a || !b) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (longer.includes(shorter)) return 1;

  const shorterTokens = new Set(shorter.split(" ").filter((token) => token.length > 2));
  const longerTokens = new Set(longer.split(" ").filter((token) => token.length > 2));
  if (!shorterTokens.size) return 0;

  let hits = 0;
  for (const token of shorterTokens) {
    if (longerTokens.has(token)) hits += 1;
  }
  return hits / shorterTokens.size;
}

function textToChunk(
  text: string,
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  confidence: number,
): { pageNumber: number; text: string; region: SourceRegion } | null {
  const chunk = blockLinesToChunk(lines, pageNumber, pageWidth, pageHeight, confidence);
  if (!chunk) return null;
  return {
    ...chunk,
    text: text.replace(/\s+/g, " ").trim(),
  };
}

function blockLinesToChunk(
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  confidence = 0.9,
): { pageNumber: number; text: string; region: SourceRegion } | null {
  if (!lines.length) return null;

  const text = lines
    .map((line) => line.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 12) return null;

  const items = lines.flatMap((line) => line.items);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }

  const typicalLineHeight =
    lines[0]?.items.reduce((max, item) => Math.max(max, item.height), 0) ?? 12;

  let maxInternalGap = 0;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const currentBottom = Math.max(
      ...lines[index]!.items.map((item) => item.y + item.height),
    );
    const gap = lines[index + 1]!.y - currentBottom;
    maxInternalGap = Math.max(maxInternalGap, gap);
  }

  const paddingX = pageWidth * 0.025;
  const paddingY = pageHeight * 0.015;
  const blockMinX = Math.min(...items.map((item) => item.x));
  const blockMaxX = Math.max(...items.map((item) => item.x + item.width));

  if (maxInternalGap > typicalLineHeight * 2) {
    minX = Math.max(pageWidth * 0.04, blockMinX - pageWidth * 0.02);
    maxX = Math.min(pageWidth * 0.96, blockMaxX + pageWidth * 0.02);
  }

  const x = clamp(minX - paddingX, 0, pageWidth);
  const y = clamp(minY - paddingY, 0, pageHeight);
  const width = clamp(maxX - minX + paddingX * 2, pageWidth * 0.15, pageWidth - x);
  const height = clamp(maxY - minY + paddingY * 2, pageHeight * 0.05, pageHeight - y);

  return {
    pageNumber,
    text,
    region: {
      pageNumber,
      x: x / pageWidth,
      y: y / pageHeight,
      width: width / pageWidth,
      height: height / pageHeight,
      sourceKind: "question-block",
      method: "pdf-layout",
      confidence,
    },
  };
}

async function getPositionedTextItems(
  page: unknown,
  viewport: { width: number; height: number; transform: number[]; scale: number },
  pdfjsUtil: { transform: (matrix: number[], vector: number[]) => number[] },
): Promise<PositionedItem[]> {
  const textContent = await (
    page as {
      getTextContent: () => Promise<{ items: Array<Record<string, unknown>> }>;
    }
  ).getTextContent();

  return textContent.items
    .filter((item): item is TextItemLike => {
      return (
        typeof item.str === "string" &&
        Boolean(item.str.trim()) &&
        Array.isArray(item.transform) &&
        item.transform.length >= 6
      );
    })
    .map((item) => {
      const tx = pdfjsUtil.transform(viewport.transform, item.transform);
      const fontSize = Math.hypot(tx[2] ?? 0, tx[3] ?? 0) || 12;
      const width =
        (typeof item.width === "number" && item.width > 0
          ? item.width
          : fontSize * item.str.length * 0.55) * viewport.scale;
      const height =
        (typeof item.height === "number" && item.height > 0
          ? item.height
          : fontSize * 1.2) * viewport.scale;

      return {
        str: item.str,
        x: tx[4] ?? 0,
        y: (tx[5] ?? 0) - height,
        width,
        height,
      };
    });
}

function groupIntoLines(positioned: PositionedItem[]): TextLine[] {
  const sorted = [...positioned].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    return a.x - b.x;
  });

  const lines: TextLine[] = [];

  for (const item of sorted) {
    const lineHeight = Math.max(item.height, 8);
    const last = lines.at(-1);

    if (last && Math.abs(item.y - last.y) <= lineHeight * 0.75) {
      last.items.push(item);
      last.text = `${last.text} ${item.str}`.trim();
      last.y = Math.min(last.y, item.y);
      continue;
    }

    lines.push({ text: item.str.trim(), items: [item], y: item.y });
  }

  return lines;
}

function itemColumnKey(item: PositionedItem, pageWidth: number): "left" | "right" | "center" {
  if (item.x < pageWidth * 0.45) return "left";
  if (item.x >= pageWidth * 0.45) return "right";
  return "center";
}

/** Split positioned text items into columns before line grouping to avoid same-row merges. */
function splitItemsByColumn(
  items: PositionedItem[],
  pageWidth: number,
): PositionedItem[][] {
  if (items.length < 2) return [items];

  const leftItems = items.filter((item) => itemColumnKey(item, pageWidth) === "left");
  const rightItems = items.filter((item) => itemColumnKey(item, pageWidth) === "right");

  if (leftItems.length >= 2 && rightItems.length >= 2) {
    return [leftItems, rightItems];
  }

  return [items];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mapChunkIdsToMcqRegions(
  mcqs: Array<{
    sourceChunkIds?: string[];
    sourcePage?: number;
    sourceRegion?: unknown;
    [key: string]: unknown;
  }>,
  chunks: SourceChunk[],
): void {
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  for (const mcq of mcqs) {
    const ids = mcq.sourceChunkIds?.filter(Boolean) ?? [];
    if (!ids.length) continue;

    const primary = chunkById.get(ids[0]!);
    if (!primary) continue;

    mcq.sourcePage = primary.pageNumber;
    const pageRegions = ids
      .map((id) => chunkById.get(id))
      .filter((chunk): chunk is SourceChunk => Boolean(chunk))
      .filter((chunk) => chunk.pageNumber === primary.pageNumber)
      .map((chunk) => chunk.region)
      .filter((region): region is SourceRegion => Boolean(region));

    mcq.sourceRegion = unionSourceRegions(pageRegions) ?? primary.region;
  }
}

function unionSourceRegions(regions: SourceRegion[]): SourceRegion | null {
  if (!regions.length) return null;

  const pageNumber = regions[0]!.pageNumber;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let confidence = 1;

  for (const region of regions) {
    minX = Math.min(minX, region.x);
    minY = Math.min(minY, region.y);
    maxX = Math.max(maxX, region.x + region.width);
    maxY = Math.max(maxY, region.y + region.height);
    confidence = Math.min(confidence, region.confidence ?? 0.85);
  }

  return {
    pageNumber,
    x: clamp(minX, 0, 1),
    y: clamp(minY, 0, 1),
    width: clamp(maxX - minX, 0.01, 1),
    height: clamp(maxY - minY, 0.01, 1),
    sourceKind: regions.some((region) => region.sourceKind === "text-line")
      ? "question-block"
      : regions[0]!.sourceKind,
    method: regions[0]!.method,
    confidence,
  };
}
