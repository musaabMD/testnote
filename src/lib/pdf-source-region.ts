import {
  isMcqBlockBoundaryLine,
  parseLeadingQuestionNumber,
  trimMcqBlockEndIndex,
} from "@/lib/mcq-line-patterns";

export type PixelRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResolvedHighlight = {
  normalized: NormalizedRegion;
  method: string;
  confidence?: number;
};

/** CSS/display viewport derived from a PDF.js render viewport at scale > 1. */
export function createCssViewport(renderViewport: ViewportLike, renderScale: number): ViewportLike {
  return {
    transform: renderViewport.transform,
    width: renderViewport.width / renderScale,
    height: renderViewport.height / renderScale,
    scale: 1,
  };
}

export function pixelToNormalized(
  region: PixelRegion,
  viewport: ViewportLike,
): NormalizedRegion {
  return {
    x: region.x / viewport.width,
    y: region.y / viewport.height,
    width: region.width / viewport.width,
    height: region.height / viewport.height,
  };
}

export function renderPixelsToCssPixels(
  region: PixelRegion,
  renderScale: number,
): PixelRegion {
  return {
    x: region.x / renderScale,
    y: region.y / renderScale,
    width: region.width / renderScale,
    height: region.height / renderScale,
  };
}

type TextItemLike = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type ViewportLike = {
  transform: number[];
  width: number;
  height: number;
  scale: number;
};

type PositionedItem = {
  str: string;
  rect: PixelRegion;
};

type PdfJsUtil = {
  transform: (matrix: number[], vector: number[]) => number[];
};

export type QuestionRegionSearch = {
  questionText: string;
  questionNumber?: number;
  optionTexts?: string[];
};

/** Find a question block on a PDF page using text positions. */
export async function findQuestionRegionInViewport(
  page: unknown,
  search: QuestionRegionSearch,
  viewport: ViewportLike,
  pdfjsUtil: PdfJsUtil,
): Promise<PixelRegion | null> {
  const positioned = await getPositionedTextItems(page, viewport, pdfjsUtil);
  if (!positioned.length) return null;

  const byNumber = findRegionByQuestionNumber(
    positioned,
    search.questionNumber,
    search.optionTexts,
    viewport,
  );
  if (byNumber) return byNumber;

  const byText = findRegionByQuestionText(
    positioned,
    search.questionText,
    search.optionTexts,
    viewport,
  );
  if (byText) return byText;

  return null;
}

export function normalizedRegionToPixels(
  region: NormalizedRegion,
  viewport: ViewportLike,
): PixelRegion {
  const paddingX = viewport.width * 0.02;
  const paddingY = viewport.height * 0.02;

  return {
    x: Math.max(0, region.x * viewport.width - paddingX),
    y: Math.max(0, region.y * viewport.height - paddingY),
    width: Math.min(viewport.width, region.width * viewport.width + paddingX * 2),
    height: Math.min(viewport.height, region.height * viewport.height + paddingY * 2),
  };
}

export async function resolveQuestionHighlightRegion(
  page: unknown,
  search: QuestionRegionSearch,
  viewport: ViewportLike,
  pdfjsUtil: PdfJsUtil,
  sourceRegion?: NormalizedRegion,
): Promise<PixelRegion | null> {
  const detected = await findQuestionRegionInViewport(page, search, viewport, pdfjsUtil);
  if (detected) return detected;

  if (!sourceRegion) return null;

  const fromApi = normalizedRegionToPixels(sourceRegion, viewport);
  if (!isValidHighlightRegion(fromApi, viewport)) return null;

  const positioned = await getPositionedTextItems(page, viewport, pdfjsUtil);
  if (regionContainsQuestionText(fromApi, positioned, search.questionText)) {
    const expanded = expandStoredRegionWithOptions(
      fromApi,
      positioned,
      viewport,
      search.questionNumber,
      search.optionTexts,
    );
    return expanded ?? fromApi;
  }

  return fromApi;
}

type ResolveFinalHighlightArgs = {
  sourceRegion?: (NormalizedRegion & { method?: string; confidence?: number; sourceKind?: string }) | null;
  page: unknown;
  renderViewport: ViewportLike;
  renderScale: number;
  pdfjsUtil: PdfJsUtil;
  questionText?: string;
  questionNumber?: number;
  optionTexts?: string[];
  /** True when preview is a converted PDF (DOCX/PPTX → PDF). */
  isConvertedPreview?: boolean;
  minConfidence?: number;
};

/**
 * Resolver priority:
 * 1. Stored question.sourceRegion / selected source chunk when confidence and size are acceptable
 * 2. Native/converted PDF layout detection when stored coordinates are missing
 * 3. Question-number block detection as a final layout fallback
 * 4. (vision-layout — not wired yet)
 * 5. (ocr-fallback — not wired yet; intentionally skipped as default)
 * 6. null → full page, no highlight
 */
export async function resolveFinalHighlightRegion({
  sourceRegion,
  page,
  renderViewport,
  renderScale,
  pdfjsUtil,
  questionText,
  questionNumber,
  optionTexts,
  isConvertedPreview = false,
  minConfidence = 0.5,
}: ResolveFinalHighlightArgs): Promise<ResolvedHighlight | null> {
  const cssViewport = createCssViewport(renderViewport, renderScale);
  const layoutMethod = isConvertedPreview ? "converted-pdf-layout" : "pdf-layout";
  const storedCandidate = getStoredHighlightCandidate(
    sourceRegion,
    cssViewport,
    minConfidence,
  );

  if (storedCandidate) {
    return storedCandidate.resolved;
  }

  if (questionNumber || questionText) {
    const fromLayout = await findQuestionRegionInViewport(
      page,
      { questionText: questionText ?? "", questionNumber, optionTexts },
      renderViewport,
      pdfjsUtil,
    );

    if (fromLayout) {
      const cssRegion = renderPixelsToCssPixels(fromLayout, renderScale);
      const layoutIsValid =
        isValidHighlightRegion(cssRegion, cssViewport) &&
        isReasonableAutoDetectedRegion(cssRegion, cssViewport);
      if (layoutIsValid) {
        return {
          normalized: pixelToNormalized(cssRegion, cssViewport),
          method: layoutMethod,
          confidence: questionNumber ? 0.92 : 0.7,
        };
      }
    }
  }

  if (questionNumber) {
    const byBlock = await findQuestionBlockRegion(
      page,
      questionNumber,
      optionTexts,
      renderViewport,
      pdfjsUtil,
    );
    if (byBlock) {
      const cssRegion = renderPixelsToCssPixels(byBlock, renderScale);
      if (
        isValidHighlightRegion(cssRegion, cssViewport) &&
        isReasonableAutoDetectedRegion(cssRegion, cssViewport)
      ) {
        return {
          normalized: pixelToNormalized(cssRegion, cssViewport),
          method: layoutMethod,
          confidence: 0.85,
        };
      }
    }
  }

  return null;
}

function getStoredHighlightCandidate(
  sourceRegion: ResolveFinalHighlightArgs["sourceRegion"],
  cssViewport: ViewportLike,
  minConfidence: number,
):
  | {
      pixels: PixelRegion;
      resolved: ResolvedHighlight;
    }
  | null {
  if (!sourceRegion) return null;

  const confidence = sourceRegion.confidence;
  const confidenceOk = confidence === undefined || confidence >= minConfidence;
  if (!confidenceOk) return null;

  const stored = normalizedRegionToPixels(sourceRegion, cssViewport);
  const regionTooTall = sourceRegion.height > 0.28;
  if (!isValidHighlightRegion(stored, cssViewport) || regionTooTall) return null;

  return {
    pixels: stored,
    resolved: {
      normalized: sourceRegion,
      method: sourceRegion.method ?? "stored",
      confidence,
    },
  };
}

function isReasonableAutoDetectedRegion(region: PixelRegion, viewport: ViewportLike) {
  return region.height <= viewport.height * 0.45;
}

function regionArea(region: PixelRegion) {
  return region.width * region.height;
}

/** Full question block: question start → next question start (includes stem, images, options). */
export async function findQuestionBlockRegion(
  page: unknown,
  questionNumber: number,
  optionTexts: string[] | undefined,
  viewport: ViewportLike,
  pdfjsUtil: PdfJsUtil,
): Promise<PixelRegion | null> {
  const positioned = await getPositionedTextItems(page, viewport, pdfjsUtil);
  if (!positioned.length) return null;

  const lines = groupIntoLines(positioned);
  const startLineIndex = lines.findIndex((line) =>
    lineHasQuestionNumber(line.text, questionNumber),
  );
  if (startLineIndex < 0) return null;

  let endLineIndex = startLineIndex;
  for (let index = startLineIndex + 1; index < lines.length; index += 1) {
    const nextNumber = parseLeadingQuestionNumber(lines[index]!.text);
    if (nextNumber !== null && nextNumber !== questionNumber) {
      endLineIndex = index - 1;
      break;
    }
    endLineIndex = index;
  }

  endLineIndex = trimMcqBlockEndIndex(lines, startLineIndex, endLineIndex);

  endLineIndex = extendEndLineToIncludeOptions(
    lines,
    startLineIndex,
    endLineIndex,
    questionNumber,
    optionTexts,
    14,
  );

  const blockLines = lines.slice(startLineIndex, endLineIndex + 1);
  const blockItems = blockLines.flatMap((line) => line.items);

  let region = unionRects(
    blockItems.map((item) => item.rect),
    viewport,
  );

  if (!region) return null;

  region = expandBlockForImageGaps(region, blockLines, viewport);
  return region;
}

function expandBlockForImageGaps(
  region: PixelRegion,
  blockLines: TextLine[],
  viewport: ViewportLike,
): PixelRegion {
  if (blockLines.length < 2) return region;

  let maxInternalGap = 0;
  for (let index = 0; index < blockLines.length - 1; index += 1) {
    const current = blockLines[index]!;
    const next = blockLines[index + 1]!;
    const currentBottom = Math.max(...current.items.map((item) => item.rect.y + item.rect.height));
    const gap = next.y - currentBottom;
    maxInternalGap = Math.max(maxInternalGap, gap);
  }

  const typicalLineHeight =
    blockLines[0]?.items.reduce((max, item) => Math.max(max, item.rect.height), 0) ?? 12;

  if (maxInternalGap > typicalLineHeight * 2) {
    const marginX = viewport.width * 0.04;
    return {
      x: marginX,
      y: region.y,
      width: viewport.width - marginX * 2,
      height: region.y + region.height - region.y,
    };
  }

  return region;
}

export function isValidHighlightRegion(
  region: PixelRegion,
  viewport: ViewportLike,
): boolean {
  return (
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width >= 48 &&
    region.height >= 24 &&
    region.width <= viewport.width * 0.95 &&
    region.height <= viewport.height * 0.85 &&
    region.x + region.width <= viewport.width * 1.05 &&
    region.y + region.height <= viewport.height * 1.05 &&
    regionArea(region) <= viewport.width * viewport.height * 0.35
  );
}

async function getPositionedTextItems(
  page: unknown,
  viewport: ViewportLike,
  pdfjsUtil: PdfJsUtil,
): Promise<PositionedItem[]> {
  const textContent = await (
    page as {
      getTextContent: () => Promise<{ items: Array<Record<string, unknown>> }>;
    }
  ).getTextContent();

  const items = textContent.items.filter((item): item is TextItemLike => {
    return (
      typeof item.str === "string" &&
      Boolean(item.str.trim()) &&
      Array.isArray(item.transform) &&
      item.transform.length >= 6
    );
  });

  return items.map((item) => ({
    str: item.str,
    rect: itemToViewportRect(item, viewport, pdfjsUtil),
  }));
}

function findRegionByQuestionNumber(
  positioned: PositionedItem[],
  questionNumber: number | undefined,
  optionTexts: string[] | undefined,
  viewport: ViewportLike,
): PixelRegion | null {
  if (!questionNumber || questionNumber < 1) return null;

  const lines = groupIntoLines(positioned);
  const startLineIndex = lines.findIndex((line) =>
    lineHasQuestionNumber(line.text, questionNumber),
  );

  if (startLineIndex < 0) return null;

  const endLineIndex = extendEndLineToIncludeOptions(
    lines,
    startLineIndex,
    startLineIndex,
    questionNumber,
    optionTexts,
  );

  const slice = lines.slice(startLineIndex, endLineIndex + 1).flatMap((line) => line.items);
  return unionRects(
    slice.map((item) => item.rect),
    viewport,
  );
}

function findRegionByQuestionText(
  positioned: PositionedItem[],
  questionText: string,
  optionTexts: string[] | undefined,
  viewport: ViewportLike,
): PixelRegion | null {
  const normalizedQuestion = normalizeForMatch(questionText);
  const needleWords = normalizedQuestion.split(/\s+/).filter(Boolean);
  const isArabic = containsArabicScript(questionText);
  const minWords = isArabic ? 2 : 3;

  const lines = groupIntoLines(positioned);

  if (normalizedQuestion.length >= 8) {
    const directMatch = findRegionByDirectPhrase(lines, normalizedQuestion, optionTexts, viewport);
    if (directMatch) return directMatch;
  }

  if (needleWords.length < minWords) return null;
  const windowSize = Math.min(8, needleWords.length);
  let best: { score: number; start: number; end: number } | null = null;

  for (let start = 0; start < lines.length; start += 1) {
    for (let end = start; end < Math.min(lines.length, start + 20); end += 1) {
      const haystack = normalizeForMatch(
        lines.slice(start, end + 1).map((line) => line.text).join(" "),
      );
      const score = phraseMatchScore(haystack, needleWords.slice(0, windowSize));
      if (score < 0.45) continue;

      const candidate = { score, start, end };
      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
  }

  if (!best) return null;

  const endLineIndex = extendEndLineToIncludeOptions(
    lines,
    best.start,
    best.end,
    undefined,
    optionTexts,
  );

  const slice = lines.slice(best.start, endLineIndex + 1).flatMap((line) => line.items);
  return unionRects(
    slice.map((item) => item.rect),
    viewport,
  );
}

function regionContainsQuestionText(
  region: PixelRegion,
  positioned: PositionedItem[],
  questionText: string,
): boolean {
  const needleWords = normalizeForMatch(questionText).split(/\s+/).filter(Boolean).slice(0, 6);
  if (needleWords.length < 2) return true;

  const textInRegion = positioned
    .filter((item) => rectsOverlap(item.rect, region))
    .map((item) => item.str)
    .join(" ");

  return phraseMatchScore(normalizeForMatch(textInRegion), needleWords) >= 0.35;
}

type TextLine = { text: string; items: PositionedItem[]; y: number };

/** Extend a matched question block downward to include answer choices. */
function extendEndLineToIncludeOptions(
  lines: TextLine[],
  startLineIndex: number,
  endLineIndex: number,
  questionNumber: number | undefined,
  optionTexts: string[] | undefined,
  maxExtraLines = 10,
): number {
  let extendedEnd = endLineIndex;
  const startLine = lines[startLineIndex];
  if (!startLine) return endLineIndex;

  const optionEndLine = findEndLineFromOptions(lines, endLineIndex + 1, optionTexts);
  if (optionEndLine !== null) return optionEndLine;

  const typicalLineHeight =
    startLine.items.reduce((max, item) => Math.max(max, item.rect.height), 0) || 12;
  const maxEnd = Math.min(lines.length - 1, endLineIndex + maxExtraLines);

  for (let index = endLineIndex + 1; index <= maxEnd; index += 1) {
    const line = lines[index]!;
    if (isMcqBlockBoundaryLine(line.text)) break;

    const nextNumber = parseLeadingQuestionNumber(line.text);
    if (nextNumber !== null && nextNumber !== questionNumber) break;

    const prevLine = lines[extendedEnd]!;
    const gap = line.y - prevLine.y;
    if (gap > typicalLineHeight * 3.5) break;

    extendedEnd = index;
  }

  return extendedEnd;
}

function expandStoredRegionWithOptions(
  region: PixelRegion,
  positioned: PositionedItem[],
  viewport: ViewportLike,
  questionNumber: number | undefined,
  optionTexts: string[] | undefined,
): PixelRegion | null {
  const lines = groupIntoLines(positioned);
  const startLineIndex = lines.findIndex((line) =>
    line.items.some((item) => rectsOverlap(item.rect, region)),
  );
  if (startLineIndex < 0) return null;

  const endLineIndex = extendEndLineToIncludeOptions(
    lines,
    startLineIndex,
    startLineIndex,
    questionNumber,
    optionTexts,
  );
  const slice = lines.slice(startLineIndex, endLineIndex + 1).flatMap((line) => line.items);
  const expanded = unionRects(
    slice.map((item) => item.rect),
    viewport,
  );

  if (expanded && isValidHighlightRegion(expanded, viewport)) {
    return expanded;
  }

  return null;
}

function findEndLineFromOptions(
  lines: TextLine[],
  fromLineIndex: number,
  optionTexts: string[] | undefined,
): number | null {
  const normalizedOptions = (optionTexts ?? [])
    .map((option) => normalizeForMatch(option))
    .filter(Boolean);
  if (!normalizedOptions.length) return null;

  const matchedOptions = new Set<number>();
  let lastMatchedLine = -1;
  const maxEnd = Math.min(lines.length - 1, fromLineIndex + normalizedOptions.length * 3 + 4);

  for (let lineIndex = fromLineIndex; lineIndex <= maxEnd; lineIndex += 1) {
    const lineText = normalizeForMatch(lines[lineIndex]?.text ?? "");
    if (!lineText) continue;

    normalizedOptions.forEach((optionText, optionIndex) => {
      if (matchedOptions.has(optionIndex)) return;

      const optionWords = optionText.split(/\s+/).filter(Boolean);
      const score = phraseMatchScore(lineText, optionWords);
      const threshold = optionWords.length <= 2 ? 1 : 0.75;

      if (score >= threshold || lineText.includes(optionText)) {
        matchedOptions.add(optionIndex);
        lastMatchedLine = Math.max(lastMatchedLine, lineIndex);
      }
    });

    if (matchedOptions.size === normalizedOptions.length) {
      return lastMatchedLine;
    }
  }

  const minimumMatches = Math.min(2, normalizedOptions.length);
  return matchedOptions.size >= minimumMatches ? lastMatchedLine : null;
}

function groupIntoLines(positioned: PositionedItem[]) {
  const sorted = [...positioned].sort((a, b) => {
    const yDiff = a.rect.y - b.rect.y;
    if (Math.abs(yDiff) > 4) return yDiff;
    return a.rect.x - b.rect.x;
  });

  const lines: Array<{ text: string; items: PositionedItem[]; y: number }> = [];

  for (const item of sorted) {
    const lineHeight = Math.max(item.rect.height, 8);
    const last = lines.at(-1);

    if (last && Math.abs(item.rect.y - last.y) <= lineHeight * 0.75) {
      last.items.push(item);
      last.text = `${last.text} ${item.str}`.trim();
      last.y = Math.min(last.y, item.rect.y);
      continue;
    }

    lines.push({ text: item.str.trim(), items: [item], y: item.rect.y });
  }

  return lines;
}

function lineHasQuestionNumber(text: string, questionNumber: number): boolean {
  return parseLeadingQuestionNumber(text) === questionNumber;
}

function phraseMatchScore(haystack: string, needleWords: string[]): number {
  if (!needleWords.length || !haystack) return 0;

  let matched = 0;
  let fromIndex = 0;

  for (const word of needleWords) {
    const index = haystack.indexOf(word, fromIndex);
    if (index < 0) continue;
    matched += 1;
    fromIndex = index + word.length;
  }

  return matched / needleWords.length;
}

function itemToViewportRect(
  item: TextItemLike,
  viewport: ViewportLike,
  pdfjsUtil: PdfJsUtil,
): PixelRegion {
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
    x: tx[4] ?? 0,
    y: (tx[5] ?? 0) - height,
    width,
    height,
  };
}

function unionRects(rects: PixelRegion[], viewport: ViewportLike): PixelRegion | null {
  if (!rects.length) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  const paddingX = viewport.width * 0.025;
  const paddingY = viewport.height * 0.02;

  const x = clamp(minX - paddingX, 0, viewport.width);
  const y = clamp(minY - paddingY, 0, viewport.height);
  const width = clamp(maxX - minX + paddingX * 2, viewport.width * 0.15, viewport.width - x);
  const height = clamp(maxY - minY + paddingY * 2, viewport.height * 0.06, viewport.height - y);

  return { x, y, width, height };
}

function rectsOverlap(a: PixelRegion, b: PixelRegion): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsArabicScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function findRegionByDirectPhrase(
  lines: TextLine[],
  normalizedPhrase: string,
  optionTexts: string[] | undefined,
  viewport: ViewportLike,
): PixelRegion | null {
  if (!normalizedPhrase) return null;

  for (let start = 0; start < lines.length; start += 1) {
    for (let end = start; end < Math.min(lines.length, start + 18); end += 1) {
      const haystack = normalizeForMatch(
        lines.slice(start, end + 1)
          .map((line) => line.text)
          .join(" "),
      );
      if (!haystack) continue;

      if (
        haystack.includes(normalizedPhrase) ||
        normalizedPhrase.includes(haystack) ||
        normalizedPhrase.startsWith(haystack.slice(0, Math.min(haystack.length, 24)))
      ) {
        const endLineIndex = extendEndLineToIncludeOptions(
          lines,
          start,
          end,
          undefined,
          optionTexts,
        );
        const slice = lines.slice(start, endLineIndex + 1).flatMap((line) => line.items);
        const region = unionRects(
          slice.map((item) => item.rect),
          viewport,
        );
        if (region && isValidHighlightRegion(region, viewport)) {
          return region;
        }
      }
    }
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
