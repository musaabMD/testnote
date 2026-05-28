import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  MIN_HIGHLIGHT_CONFIDENCE,
  normalizeSourceRegion,
  type QuestionSourcePayload,
  type SourceChunk,
  type SourcePagePreview,
  type SourceRegion,
} from "@/lib/highlightable-source";
import type { PdfMcq, PdfMcqResult } from "@/lib/pdf-mcqs";
import {
  assertProductionServerStorage,
  isConvexStorageConfigured,
  isDevelopmentStorageAllowed,
} from "@/lib/server-storage.server";

const PREVIEW_DIR = path.join(process.cwd(), ".data", "source-page-previews");
const DEFAULT_PAGE_WIDTH = 1000;
const DEFAULT_PAGE_HEIGHT = 1414;

export type SourcePreviewGenerationReport = {
  updatedRegions: number;
  generatedPreviews: number;
  previewFailures: number;
};

type StoredQuestionSource = Extract<QuestionSourcePayload, { status: "ready" }>;
type GeneratedSourcePagePreview = SourcePagePreview & {
  imageBytes: Buffer;
  previewMimeType: "image/webp";
};

async function ensurePreviewDir() {
  if (!isDevelopmentStorageAllowed()) return;
  await mkdir(PREVIEW_DIR, { recursive: true });
}

function sourceFilePath(questionId: string) {
  return path.join(PREVIEW_DIR, `${questionId.replace(/[^a-zA-Z0-9:_-]/g, "_")}.json`);
}

function pagePreviewFilePath(fileId: string, pageNumber: number) {
  return path.join(
    PREVIEW_DIR,
    `${fileId.replace(/[^a-zA-Z0-9:_-]/g, "_")}-page-${pageNumber}.json`,
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= 8) break;
  }

  if (current && lines.length < 8) lines.push(current);
  return lines;
}

function renderPageSvg(chunks: SourceChunk[], pageNumber: number): string {
  const pageChunks = chunks.filter((chunk) => chunk.pageNumber === pageNumber);
  const textBlocks = pageChunks
    .map((chunk) => {
      const region = chunk.region;
      const x = Math.max(40, region.x * DEFAULT_PAGE_WIDTH);
      const y = Math.max(55, region.y * DEFAULT_PAGE_HEIGHT + 28);
      const width = Math.max(160, region.width * DEFAULT_PAGE_WIDTH);
      const maxChars = Math.max(24, Math.floor(width / 9));
      const lines = wrapWords(chunk.text, maxChars);
      return `<g>
        <rect x="${x - 12}" y="${y - 24}" width="${width + 24}" height="${Math.max(
          40,
          lines.length * 24 + 18,
        )}" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
        <text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#111827">
          ${lines
            .map(
              (line, index) =>
                `<tspan x="${x}" dy="${index === 0 ? 0 : 24}">${escapeXml(line)}</tspan>`,
            )
            .join("")}
        </text>
      </g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DEFAULT_PAGE_WIDTH}" height="${DEFAULT_PAGE_HEIGHT}" viewBox="0 0 ${DEFAULT_PAGE_WIDTH} ${DEFAULT_PAGE_HEIGHT}">
    <rect width="100%" height="100%" fill="#f8fafc"/>
    <rect x="24" y="24" width="${DEFAULT_PAGE_WIDTH - 48}" height="${
      DEFAULT_PAGE_HEIGHT - 48
    }" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <text x="50" y="58" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#475569">Source page ${pageNumber}</text>
    ${textBlocks}
  </svg>`;
}

async function buildPagePreview(args: {
  fileId: string;
  pageNumber: number;
  chunks: SourceChunk[];
}): Promise<GeneratedSourcePagePreview> {
  const id = `${args.fileId}:page:${args.pageNumber}`;
  const svg = renderPageSvg(args.chunks, args.pageNumber);
  const webp = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  return {
    id,
    fileId: args.fileId,
    pageNumber: args.pageNumber,
    imageUrl: `data:image/webp;base64,${webp.toString("base64")}`,
    imageBytes: webp,
    previewMimeType: "image/webp",
    width: DEFAULT_PAGE_WIDTH,
    height: DEFAULT_PAGE_HEIGHT,
  };
}

export function validateSourceRegionForImage(
  region: SourceRegion | undefined,
  imageWidth: number,
  imageHeight: number,
): boolean {
  if (!region) return false;
  if (region.confidence !== undefined && region.confidence < MIN_HIGHLIGHT_CONFIDENCE) {
    return false;
  }

  const pixelBox = {
    x: region.x * imageWidth,
    y: region.y * imageHeight,
    width: region.width * imageWidth,
    height: region.height * imageHeight,
  };

  return (
    pixelBox.x >= 0 &&
    pixelBox.y >= 0 &&
    pixelBox.width > 0 &&
    pixelBox.height > 0 &&
    pixelBox.x + pixelBox.width <= imageWidth &&
    pixelBox.y + pixelBox.height <= imageHeight
  );
}

async function syncQuestionSourceToConvex(payload: StoredQuestionSource): Promise<void> {
  if (!isConvexStorageConfigured()) return;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  await client.mutation(api.extractionStorage.upsertQuestionSource, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    questionId: payload.questionId,
    fileId: payload.fileId,
    sourcePagePreviewId: payload.sourcePagePreviewId,
    pageNumber: payload.pageNumber,
    imageUrl: payload.imageUrl,
    previewMimeType: payload.previewMimeType,
    previewR2Key: payload.previewR2Key,
    width: payload.width,
    height: payload.height,
    sourceRegion: payload.sourceRegion,
    highlightConfirmed: payload.highlightConfirmed,
  });
}

function bufferToExactArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function asPreviewMimeType(value: unknown): SourcePagePreview["previewMimeType"] {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp"
    ? value
    : undefined;
}

async function storePreviewImageInConvex(
  preview: GeneratedSourcePagePreview,
): Promise<Pick<SourcePagePreview, "imageUrl" | "previewR2Key"> | null> {
  if (!isConvexStorageConfigured()) return null;

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../../convex/_generated/api");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const stored = await client.action(api.extractionStorage.storeQuestionSourcePreview, {
    secret: process.env.EXTRACTION_STORAGE_SECRET!,
    fileId: preview.fileId,
    sourcePagePreviewId: preview.id,
    pageNumber: preview.pageNumber,
    imageBytes: bufferToExactArrayBuffer(preview.imageBytes),
  });

  return {
    imageUrl: stored.url ?? preview.imageUrl,
    previewR2Key: stored.r2Key,
  };
}

async function writeLocalQuestionSource(payload: StoredQuestionSource): Promise<void> {
  if (!isDevelopmentStorageAllowed()) return;
  await ensurePreviewDir();
  await writeFile(sourceFilePath(payload.questionId), JSON.stringify(payload), "utf8");
  await writeFile(
    pagePreviewFilePath(payload.fileId, payload.pageNumber),
    JSON.stringify({
      id: payload.sourcePagePreviewId,
      fileId: payload.fileId,
      pageNumber: payload.pageNumber,
      imageUrl: payload.imageUrl,
      previewMimeType: payload.previewMimeType,
      previewR2Key: payload.previewR2Key,
      width: payload.width,
      height: payload.height,
    } satisfies SourcePagePreview),
    "utf8",
  );
}

export async function getQuestionSourcePayload(
  questionId: string,
): Promise<QuestionSourcePayload> {
  assertProductionServerStorage();

  if (!questionId.trim()) {
    return { status: "not_ready", questionId, reason: "question_id_missing" };
  }

  if (isConvexStorageConfigured()) {
    try {
      const { ConvexHttpClient } = await import("convex/browser");
      const { api } = await import("../../convex/_generated/api");
      const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
      const row = await client.query(api.extractionStorage.getQuestionSource, {
        secret: process.env.EXTRACTION_STORAGE_SECRET!,
        questionId,
      });
      if (row) {
        return {
          status: "ready",
          ...row,
          previewMimeType: asPreviewMimeType(row.previewMimeType),
        };
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[source-preview] Convex source lookup failed:", error);
      }
    }
  }

  if (isDevelopmentStorageAllowed()) {
    try {
      const raw = await readFile(sourceFilePath(questionId), "utf8");
      return JSON.parse(raw) as StoredQuestionSource;
    } catch {
      return { status: "not_ready", questionId, reason: "question_source_missing" };
    }
  }

  return { status: "not_ready", questionId, reason: "question_source_missing" };
}

export async function getServerSourcePagePreview(
  fileId: string,
  pageNumber: number,
): Promise<SourcePagePreview | null> {
  assertProductionServerStorage();

  if (!fileId.trim() || pageNumber < 1) return null;

  if (isConvexStorageConfigured()) {
    try {
      const { ConvexHttpClient } = await import("convex/browser");
      const { api } = await import("../../convex/_generated/api");
      const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
      const row = await client.query(api.extractionStorage.getQuestionSourceForPage, {
        secret: process.env.EXTRACTION_STORAGE_SECRET!,
        fileId,
        pageNumber,
      });
      if (row?.imageUrl) {
        return {
          ...row,
          previewMimeType: asPreviewMimeType(row.previewMimeType),
        };
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[source-preview] Convex page preview lookup failed:", error);
      }
    }
  }

  if (isDevelopmentStorageAllowed()) {
    try {
      const raw = await readFile(pagePreviewFilePath(fileId, pageNumber), "utf8");
      return JSON.parse(raw) as SourcePagePreview;
    } catch {
      return null;
    }
  }

  return null;
}

export async function attachServerSourcePreviews(args: {
  result: PdfMcqResult;
  sourceChunks: SourceChunk[];
  fileId: string;
}): Promise<{ result: PdfMcqResult; report: SourcePreviewGenerationReport }> {
  const previewsByPage = new Map<number, GeneratedSourcePagePreview>();
  const storedPreviewsByPage = new Map<
    number,
    Pick<SourcePagePreview, "imageUrl" | "previewR2Key">
  >();
  let generatedPreviews = 0;
  let previewFailures = 0;

  const nextMcqs: PdfMcq[] = [];

  for (const [index, question] of args.result.mcqs.entries()) {
    const questionId = question.questionId ?? `${args.fileId}:q:${index + 1}`;
    const pageNumber = question.sourceRegion?.pageNumber ?? question.sourcePage;
    const sourceRegion = question.sourceRegion
      ? normalizeSourceRegion(
          question.sourceRegion as Parameters<typeof normalizeSourceRegion>[0],
          pageNumber ?? 1,
        )
      : undefined;

    if (!pageNumber || !sourceRegion) {
      nextMcqs.push({
        ...question,
        questionId,
        sourcePageImageUrl: undefined,
        sourcePagePreviewId: undefined,
        sourcePageWidth: undefined,
        sourcePageHeight: undefined,
      });
      continue;
    }

    try {
      let preview = previewsByPage.get(pageNumber);
      if (!preview) {
        preview = await buildPagePreview({
          fileId: args.fileId,
          pageNumber,
          chunks: args.sourceChunks,
        });
        previewsByPage.set(pageNumber, preview);
        generatedPreviews += 1;
      }

      let storedPreview = storedPreviewsByPage.get(pageNumber);
      if (!storedPreview) {
        storedPreview =
          (await storePreviewImageInConvex(preview).catch((error) => {
            if (process.env.NODE_ENV === "development") {
              console.warn("[source-preview] R2 preview storage failed:", error);
            }
            return null;
          })) ?? {
            imageUrl: preview.imageUrl,
            previewR2Key: undefined,
          };
        storedPreviewsByPage.set(pageNumber, storedPreview);
      }

      const highlightConfirmed = validateSourceRegionForImage(
        sourceRegion,
        preview.width,
        preview.height,
      );

      const payload: StoredQuestionSource = {
        status: "ready",
        questionId,
        fileId: args.fileId,
        sourcePagePreviewId: preview.id,
        pageNumber,
        imageUrl: storedPreview.imageUrl,
        previewMimeType: preview.previewMimeType,
        previewR2Key: storedPreview.previewR2Key,
        width: preview.width,
        height: preview.height,
        sourceRegion,
        highlightConfirmed,
      };

      await syncQuestionSourceToConvex(payload);
      await writeLocalQuestionSource(payload);

      nextMcqs.push({
        ...question,
        questionId,
        sourcePageImageUrl: storedPreview.imageUrl,
        sourcePagePreviewId: preview.id,
        sourcePageWidth: preview.width,
        sourcePageHeight: preview.height,
      });
    } catch (error) {
      previewFailures += 1;
      if (process.env.NODE_ENV === "development") {
        console.warn("[source-preview] preview generation failed:", error);
      }
      nextMcqs.push({
        ...question,
        questionId,
        sourcePageImageUrl: undefined,
        sourcePagePreviewId: undefined,
        sourcePageWidth: undefined,
        sourcePageHeight: undefined,
      });
    }
  }

  return {
    result: { ...args.result, mcqs: nextMcqs },
    report: {
      updatedRegions: nextMcqs.filter((question) => question.sourceRegion).length,
      generatedPreviews,
      previewFailures,
    },
  };
}
