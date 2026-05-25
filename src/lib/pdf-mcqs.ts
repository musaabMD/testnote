import type { SourceChunk } from "@/lib/highlightable-source";
import type { RagSourceChunk } from "@/lib/source-rag";

export type PdfMcq = {
  questionId?: string;
  question?: string;
  choices?: string[];
  answer?: string;
  explanation?: string;
  questionNumber?: number;
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  notes?: string[];
  imageIds?: string[];
  imageUrls?: string[];
  rawJson?: unknown;
  status?: string;
  sourceFile?: string;
  sourcePage?: number;
  sourceRegion?: {
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
    sourceKind?: "question-block" | "text-line" | "page";
    method?:
      | "stored"
      | "pdf-layout"
      | "converted-pdf-layout"
      | "vision-layout"
      | "ocr-fallback"
      | "manual"
      | "pdf-text"
      | "ocr"
      | "ai";
    confidence?: number;
  };
  sourceChunkIds?: string[];
  sourcePagePreviewId?: string;
  sourcePageImageUrl?: string;
  sourcePageWidth?: number;
  sourcePageHeight?: number;
  exactQuote?: string;
  imageRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type PdfMcqResult = {
  title: string;
  summary: string;
  mcqs: PdfMcq[];
};

export const PDF_MCQ_STORAGE_KEY = "testnote:pdf-mcqs";
export const PDF_SOURCE_STORAGE_KEY = "testnote:pdf-source";
export const PDF_FILE_QUEUE_STORAGE_KEY = "testnote:pdf-file-queue";

export type PdfSource = {
  dataUrl?: string;
  mimeType?: string;
  name: string;
  url: string;
  previewUrl?: string;
  previewMimeType?: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
};

export type PdfFileQueueItem = {
  id: string;
  name: string;
  result: PdfMcqResult;
  source: PdfSource;
  status: "completed";
  pageCount?: number;
  addedAt?: number;
  addedBy?: string;
  resourceKind?: "file" | "link";
  sourceChunks?: SourceChunk[];
  ragSourceChunks?: RagSourceChunk[];
};

export function isPdfSource(value: unknown): value is PdfSource {
  if (!value || typeof value !== "object") return false;

  const source = value as Partial<PdfSource>;
  return (
    typeof source.name === "string" &&
    typeof source.url === "string" &&
    (typeof source.dataUrl === "undefined" || typeof source.dataUrl === "string") &&
    (typeof source.mimeType === "undefined" || typeof source.mimeType === "string") &&
    (typeof source.previewUrl === "undefined" || typeof source.previewUrl === "string") &&
    (typeof source.previewMimeType === "undefined" || typeof source.previewMimeType === "string")
  );
}

export function isPdfMcqResult(value: unknown): value is PdfMcqResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<PdfMcqResult>;

  return (
    typeof result.title === "string" &&
    typeof result.summary === "string" &&
    Array.isArray(result.mcqs) &&
    result.mcqs.every((item) => isPdfMcq(item))
  );
}

function isPdfMcq(value: unknown): value is PdfMcq {
  if (!value || typeof value !== "object") return false;

  const item = value as Partial<PdfMcq>;

  return (
    (typeof item.questionId === "undefined" || typeof item.questionId === "string") &&
    (typeof item.question === "undefined" || typeof item.question === "string") &&
    (typeof item.questionText === "undefined" || typeof item.questionText === "string") &&
    (typeof item.questionNumber === "undefined" || typeof item.questionNumber === "number") &&
    (typeof item.choices === "undefined" ||
      (Array.isArray(item.choices) && item.choices.every((choice) => typeof choice === "string"))) &&
    (typeof item.options === "undefined" ||
      (Array.isArray(item.options) &&
        item.options.every(
          (option) =>
            option &&
            typeof option === "object" &&
            typeof option.label === "string" &&
            typeof option.text === "string",
        ))) &&
    (typeof item.answer === "undefined" || typeof item.answer === "string") &&
    (typeof item.correctAnswer === "undefined" || typeof item.correctAnswer === "string") &&
    (typeof item.explanation === "undefined" || typeof item.explanation === "string") &&
    (typeof item.notes === "undefined" ||
      (Array.isArray(item.notes) && item.notes.every((note) => typeof note === "string"))) &&
    (typeof item.imageIds === "undefined" ||
      (Array.isArray(item.imageIds) && item.imageIds.every((imageId) => typeof imageId === "string"))) &&
    (typeof item.imageUrls === "undefined" ||
      (Array.isArray(item.imageUrls) && item.imageUrls.every((imageUrl) => typeof imageUrl === "string"))) &&
    (typeof item.status === "undefined" || typeof item.status === "string") &&
    (typeof item.sourceFile === "undefined" || typeof item.sourceFile === "string") &&
    (typeof item.sourcePage === "undefined" || typeof item.sourcePage === "number") &&
    (typeof item.sourceRegion === "undefined" || isNormalizedRegion(item.sourceRegion)) &&
    (typeof item.imageRegion === "undefined" || isNormalizedRegion(item.imageRegion)) &&
    (typeof item.sourceChunkIds === "undefined" ||
      (Array.isArray(item.sourceChunkIds) &&
        item.sourceChunkIds.every((chunkId) => typeof chunkId === "string"))) &&
    (typeof item.sourcePagePreviewId === "undefined" ||
      typeof item.sourcePagePreviewId === "string") &&
    (typeof item.sourcePageImageUrl === "undefined" ||
      typeof item.sourcePageImageUrl === "string") &&
    (typeof item.sourcePageWidth === "undefined" || typeof item.sourcePageWidth === "number") &&
    (typeof item.sourcePageHeight === "undefined" || typeof item.sourcePageHeight === "number") &&
    (typeof item.exactQuote === "undefined" || typeof item.exactQuote === "string")
  );
}

function isNormalizedRegion(value: unknown): value is NonNullable<PdfMcq["sourceRegion"]> {
  if (!value || typeof value !== "object") return false;
  const region = value as Partial<NonNullable<PdfMcq["sourceRegion"]>>;
  return (
    typeof region.x === "number" &&
    typeof region.y === "number" &&
    typeof region.width === "number" &&
    typeof region.height === "number"
  );
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function coerceRegion(value: unknown): PdfMcq["sourceRegion"] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const region = value as Record<string, unknown>;
  const x = asNumber(region.x);
  const y = asNumber(region.y);
  const width = asNumber(region.width);
  const height = asNumber(region.height);

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined;
  }

  const method = asString(region.method).trim();
  const sourceKind = asString(region.sourceKind).trim();

  return {
    pageNumber: asNumber(region.pageNumber) ?? 1,
    x,
    y,
    width,
    height,
    sourceKind:
      sourceKind === "question-block" || sourceKind === "text-line" || sourceKind === "page"
        ? sourceKind
        : undefined,
    method: method || undefined,
    confidence: asNumber(region.confidence),
  } as PdfMcq["sourceRegion"];
}

function coerceOptions(raw: Record<string, unknown>): Array<{ label: string; text: string }> {
  const options = raw.options ?? raw.choices ?? raw.answers;
  if (Array.isArray(options)) {
    return options
      .map((option, index) => {
        if (typeof option === "string") {
          return { label: String.fromCharCode(65 + index), text: option };
        }
        if (!option || typeof option !== "object") return null;
        const entry = option as Record<string, unknown>;
        const text = asString(
          entry.text ?? entry.value ?? entry.choice ?? entry.option ?? entry.content,
        );
        if (!text.trim()) return null;
        return {
          label: asString(entry.label ?? entry.letter ?? entry.key, String.fromCharCode(65 + index)),
          text,
        };
      })
      .filter((option): option is { label: string; text: string } => Boolean(option));
  }

  if (options && typeof options === "object" && !Array.isArray(options)) {
    return Object.entries(options as Record<string, unknown>)
      .map(([label, value]) => ({
        label: label.trim(),
        text: asString(value),
      }))
      .filter((option) => option.label && option.text.trim());
  }

  return [];
}

function coerceMcqItem(item: unknown, index: number): PdfMcq | null {
  if (typeof item === "string" && item.trim()) {
    return {
      questionNumber: index + 1,
      questionText: item.trim(),
      status: "completed",
    };
  }

  if (!item || typeof item !== "object") return null;

  const raw = item as Record<string, unknown>;
  const nestedQuestion =
    raw.question && typeof raw.question === "object" && !Array.isArray(raw.question)
      ? (raw.question as Record<string, unknown>)
      : null;
  const questionText = asString(
    raw.questionText ??
      raw.question_text ??
      raw.stem ??
      raw.prompt ??
      nestedQuestion?.text ??
      nestedQuestion?.questionText ??
      (typeof raw.question === "string" ? raw.question : undefined),
  ).trim();
  const question = asString(
    typeof raw.question === "string" ? raw.question : questionText,
  ).trim();
  const options = coerceOptions(raw);

  if (!questionText && !question && !options.length) return null;

  return {
    questionNumber: asNumber(raw.questionNumber) ?? index + 1,
    questionId: asString(raw.questionId).trim() || undefined,
    questionText: questionText || question,
    question: question || questionText || undefined,
    options: options.length ? options : undefined,
    choices: Array.isArray(raw.choices)
      ? raw.choices.map((choice) => asString(choice)).filter(Boolean)
      : undefined,
    correctAnswer: asString(raw.correctAnswer ?? raw.answer).trim() || undefined,
    answer: asString(raw.answer).trim() || undefined,
    explanation: asString(raw.explanation).trim() || undefined,
    notes: asStringArray(raw.notes ?? raw.note),
    imageIds: asStringArray(raw.imageIds),
    imageUrls: asStringArray(raw.imageUrls),
    rawJson: raw.rawJson ?? raw,
    status: asString(raw.status, "completed"),
    sourceFile: asString(raw.sourceFile).trim() || undefined,
    sourcePage: asNumber(raw.sourcePage),
    sourceRegion: coerceRegion(raw.sourceRegion),
    imageRegion: coerceRegion(raw.imageRegion),
    sourceChunkIds: asStringArray(raw.sourceChunkIds),
    sourcePagePreviewId: asString(raw.sourcePagePreviewId).trim() || undefined,
    sourcePageImageUrl: asString(raw.sourcePageImageUrl).trim() || undefined,
    sourcePageWidth: asNumber(raw.sourcePageWidth),
    sourcePageHeight: asNumber(raw.sourcePageHeight),
    exactQuote: asString(raw.exactQuote).trim() || undefined,
  };
}

const MCQ_LIST_KEYS = [
  "mcqs",
  "MCQs",
  "questions",
  "question_list",
  "extracted_questions",
  "items",
  "quiz",
  "results",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeMcqItem(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (!isRecord(value)) return false;

  return Boolean(
    value.questionText ??
      value.question_text ??
      value.question ??
      value.stem ??
      value.prompt ??
      value.options ??
      value.choices ??
      value.answers,
  );
}

function normalizeMcqList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;

  const values = Object.values(value);
  if (!values.length) return [];
  return values.every((entry) => looksLikeMcqItem(entry)) ? values : null;
}

function findMcqList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value.length === 0 || value.some((entry) => looksLikeMcqItem(entry)) ? value : null;
  }

  if (!isRecord(value)) return null;

  for (const key of MCQ_LIST_KEYS) {
    const candidate = normalizeMcqList(value[key]);
    if (candidate) return candidate;
  }

  for (const nestedKey of ["data", "result", "output", "response", "payload"]) {
    const nested = value[nestedKey];
    if (!isRecord(nested) && !Array.isArray(nested)) continue;
    const candidate = findMcqList(nested);
    if (candidate) return candidate;
  }

  return null;
}

/** Normalize messy LLM JSON into a predictable MCQ result shape. */
export function coercePdfMcqResult(value: unknown): PdfMcqResult | null {
  const mcqsRaw = findMcqList(value);
  if (!mcqsRaw) return null;

  const root = isRecord(value) ? value : {};
  const nested =
    isRecord(root.data) ? root.data : isRecord(root.result) ? root.result : null;
  const container = nested ?? root;

  const mcqs = mcqsRaw
    .map((item, index) => coerceMcqItem(item, index))
    .filter((item): item is PdfMcq => item !== null);

  return {
    title: asString(
      container.title ?? container.name ?? container.documentTitle ?? root.title,
      "Extracted questions",
    ),
    summary: asString(container.summary ?? container.description ?? root.summary, ""),
    mcqs,
  };
}

export function isPdfFileQueue(value: unknown): value is PdfFileQueueItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Partial<PdfFileQueueItem>).id === "string" &&
        typeof (item as Partial<PdfFileQueueItem>).name === "string" &&
        (item as Partial<PdfFileQueueItem>).status === "completed" &&
        isPdfSource((item as Partial<PdfFileQueueItem>).source) &&
        isPdfMcqResult((item as Partial<PdfFileQueueItem>).result) &&
        (typeof (item as Partial<PdfFileQueueItem>).pageCount === "undefined" ||
          typeof (item as Partial<PdfFileQueueItem>).pageCount === "number") &&
        (typeof (item as Partial<PdfFileQueueItem>).addedAt === "undefined" ||
          typeof (item as Partial<PdfFileQueueItem>).addedAt === "number") &&
        (typeof (item as Partial<PdfFileQueueItem>).addedBy === "undefined" ||
          typeof (item as Partial<PdfFileQueueItem>).addedBy === "string") &&
        (typeof (item as Partial<PdfFileQueueItem>).sourceChunks === "undefined" ||
          Array.isArray((item as Partial<PdfFileQueueItem>).sourceChunks)) &&
        (typeof (item as Partial<PdfFileQueueItem>).ragSourceChunks === "undefined" ||
          Array.isArray((item as Partial<PdfFileQueueItem>).ragSourceChunks))
    )
  );
}
