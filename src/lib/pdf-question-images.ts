import type { PdfMcq, PdfSource } from "@/lib/pdf-mcqs";
import { openPdfDocument } from "@/lib/pdf-document";
import { getSourceFile } from "@/lib/pdf-source-store";
import {
  normalizedRegionToPixels,
  type NormalizedRegion,
  type PixelRegion,
} from "@/lib/pdf-source-region";
import { isImageSource } from "@/lib/pdf-view-storage";

const imageCache = new Map<string, string>();

const VISUAL_KEYWORDS =
  /\b(x-?ray|radiograph|diagram|figure|fig\.|image|illustration|chart|graph|table|photo|photograph|scan|mri|ct|ultrasound|ecg|ekg|histology|specimen|picture)\b/i;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeImageRegion(
  region: PdfMcq["imageRegion"] | Record<string, unknown> | undefined,
): NormalizedRegion | undefined {
  if (!region || typeof region !== "object") return undefined;

  const raw = region as Record<string, unknown>;
  const x = clamp01(Number(raw.x));
  const y = clamp01(Number(raw.y));
  const width = clamp01(Number(raw.width));
  const height = clamp01(Number(raw.height));

  if (!Number.isFinite(x + y + width + height)) return undefined;
  if (width < 0.04 || height < 0.04) return undefined;

  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

export function questionLikelyHasVisual(question: PdfMcq): boolean {
  if (question.imageRegion) return true;
  if (question.imageUrls?.length) return true;

  const combined = [
    question.questionText,
    question.question,
    ...(question.notes ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  return VISUAL_KEYWORDS.test(combined);
}

const IMAGE_NOT_NEEDED =
  /don'?t need (the )?(picture|image)|no picture needed|picture not (required|needed)|not provided in the current context/i;

/** Whether an inline question image should be shown (filters irrelevant/spoiler crops). */
export function shouldShowQuestionImage(question: PdfMcq): boolean {
  const notes = (question.notes ?? []).join(" ");
  if (IMAGE_NOT_NEEDED.test(notes)) return false;

  // Only show cropped images when we have an explicit image region or stored crop.
  if (question.imageUrls?.length) return true;
  if (question.imageRegion) return true;

  // Do not auto-crop from sourceRegion — too often includes answer text or wrong question block.
  return false;
}


export function getEffectiveImageRegion(
  question: PdfMcq,
  source: PdfSource,
): NormalizedRegion | undefined {
  const explicit = normalizeImageRegion(question.imageRegion);
  if (explicit) return explicit;

  if (question.imageUrls?.length) return undefined;

  const sourceRegion = normalizeImageRegion(question.sourceRegion);

  if (isImageSource(source)) {
    if (sourceRegion && shouldShowQuestionImage(question)) return sourceRegion;
    return undefined;
  }

  return undefined;
}

function cropCanvasToDataUrl(canvas: HTMLCanvasElement, region: PixelRegion): string | null {
  const width = Math.max(1, Math.round(region.width));
  const height = Math.max(1, Math.round(region.height));
  if (width < 24 || height < 24) return null;

  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = height;
  const ctx = crop.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    canvas,
    Math.max(0, region.x),
    Math.max(0, region.y),
    width,
    height,
    0,
    0,
    width,
    height,
  );

  return crop.toDataURL("image/jpeg", 0.92);
}

async function loadImageElement(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image source"));
    image.src = sourceUrl;
  });
}

async function loadImageSourceUrl(source: PdfSource, fileId?: string): Promise<string | null> {
  if (fileId) {
    const stored = await getSourceFile(fileId);
    if (stored) {
      return URL.createObjectURL(new Blob([stored.data], { type: stored.mimeType }));
    }
  }
  return source.dataUrl ?? source.url ?? null;
}

async function cropImageSource(
  source: PdfSource,
  region: NormalizedRegion,
  fileId?: string,
): Promise<string | null> {
  const sourceUrl = await loadImageSourceUrl(source, fileId);
  if (!sourceUrl) return null;

  try {
    const image = await loadImageElement(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);

    const viewport = {
      transform: [1, 0, 0, 1, 0, 0],
      width: image.naturalWidth,
      height: image.naturalHeight,
      scale: 1,
    };

    return cropCanvasToDataUrl(canvas, normalizedRegionToPixels(region, viewport));
  } finally {
    if (sourceUrl.startsWith("blob:") && fileId) {
      URL.revokeObjectURL(sourceUrl);
    }
  }
}

async function cropPdfPage(
  source: PdfSource,
  pageNumber: number,
  region: NormalizedRegion,
  fileId?: string,
): Promise<string | null> {
  const pdf = await openPdfDocument(source, fileId);
  const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
  const scale = 2;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return cropCanvasToDataUrl(canvas, normalizedRegionToPixels(region, viewport));
}

export async function extractQuestionSourcePreview(
  source: PdfSource,
  question: PdfMcq,
  fileId?: string,
): Promise<string | null> {
  const region = normalizeImageRegion(question.sourceRegion);
  if (!region) return null;

  const isPdf =
    source.mimeType === "application/pdf" ||
    source.name.toLowerCase().endsWith(".pdf");

  try {
    if (isPdf) {
      return await cropPdfPage(source, question.sourcePage ?? 1, region, fileId);
    }

    if (isImageSource(source)) {
      return await cropImageSource(source, region, fileId);
    }
  } catch {
    return null;
  }

  return null;
}

export async function extractQuestionImageDataUrl(
  source: PdfSource,
  question: PdfMcq,
  fileId?: string,
): Promise<string | null> {
  const existing = question.imageUrls?.find(Boolean);
  if (existing) return existing;

  const region = getEffectiveImageRegion(question, source);
  if (!region) return null;

  const isPdf =
    source.mimeType === "application/pdf" ||
    source.name.toLowerCase().endsWith(".pdf");

  try {
    if (isPdf) {
      return await cropPdfPage(source, question.sourcePage ?? 1, region, fileId);
    }

    if (isImageSource(source)) {
      return await cropImageSource(source, region, fileId);
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveQuestionImageUrl(
  cacheKey: string,
  source: PdfSource,
  question: PdfMcq,
  fileId?: string,
): Promise<string | null> {
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  const existing = question.imageUrls?.find(Boolean);
  if (existing) {
    imageCache.set(cacheKey, existing);
    return existing;
  }

  const extracted = await extractQuestionImageDataUrl(source, question, fileId);
  if (extracted) {
    imageCache.set(cacheKey, extracted);
  }

  return extracted;
}

export async function enrichQuestionsWithImages(
  source: PdfSource,
  questions: PdfMcq[],
  fileId?: string,
): Promise<PdfMcq[]> {
  return Promise.all(
    questions.map(async (question) => {
      if (question.imageUrls?.length) return question;

      const region = getEffectiveImageRegion(question, source);
      if (!region) return question;

      const dataUrl = await extractQuestionImageDataUrl(source, question, fileId);
      if (!dataUrl) return question;

      return { ...question, imageUrls: [dataUrl] };
    }),
  );
}
