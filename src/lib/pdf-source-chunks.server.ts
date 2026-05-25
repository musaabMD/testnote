import type { SourceChunk, SourceRegion } from "@/lib/highlightable-source";
import {
  hasMcqOptionSequence,
  isOptionLine,
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

/** In-process chunk extraction — used by the PDF subprocess, not Next.js routes directly. */
export async function extractSourceChunksFromPdfInProcess(
  pdfBytes: ArrayBuffer,
  fileId?: string,
): Promise<SourceChunk[]> {
  const pdf = await loadServerPdfDocument(pdfBytes);
  const pdfjs = await getServerPdfJs();
  const chunks: SourceChunk[] = [];
  let chunkIndex = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const positioned = await getPositionedTextItems(page, viewport, pdfjs.Util);
    const columnItemGroups = splitItemsByColumn(positioned, viewport.width);

    for (const columnItems of columnItemGroups) {
      const lines = groupIntoLines(columnItems);
      const pageChunks = chunkQuestionBlocks(
        lines,
        pageNumber,
        viewport.width,
        viewport.height,
      );

      for (const chunk of pageChunks) {
        chunkIndex += 1;
        chunks.push({
          id: `chunk_${fileId ?? "file"}_${chunkIndex}`,
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

function findQuestionStartIndexes(lines: TextLine[]): number[] {
  const questionStarts: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (
      parseLeadingQuestionNumber(lines[index]!.text) !== null ||
      parseStandaloneQuestionNumberLine(lines[index]!.text) !== null
    ) {
      questionStarts.push(index);
    }
  }

  return questionStarts;
}

/** question start → next question start, including image gaps between stem and options. */
function chunkQuestionBlocks(
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
): Array<{ pageNumber: number; text: string; region: SourceRegion }> {
  const questionStarts = findQuestionStartIndexes(lines);
  if (questionStarts.length > 0) {
    return chunkByQuestionStarts(
      lines,
      questionStarts,
      pageNumber,
      pageWidth,
      pageHeight,
    );
  }

  const optionChunks = chunkByOptionBlocks(lines, pageNumber, pageWidth, pageHeight);
  if (optionChunks.length > 0) {
    return optionChunks;
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
    if (!hasMcqOptionSequence(lines, index)) continue;

    let startIndex = index;
    for (let back = index - 1; back >= 0 && back >= index - 14; back -= 1) {
      const lineText = lines[back]!.text;
      if (parseLeadingQuestionNumber(lineText) !== null) break;
      if (isOptionLine(lineText, "D") || isOptionLine(lineText, "E")) break;
      startIndex = back;
    }

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

  for (const line of lines) {
    if (parseLeadingQuestionNumber(line.text) !== null) return true;
    if (parseStandaloneQuestionNumberLine(line.text) !== null) return true;
    if (isOptionLine(line.text)) optionLines += 1;
  }

  return optionLines >= 2;
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
    mcq.sourceRegion = primary.region;
  }
}
