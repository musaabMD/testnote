import type { PdfSource } from "@/lib/pdf-mcqs";
import { createCssViewport } from "@/lib/pdf-source-region";
import { openPdfDocument } from "@/lib/pdf-document";
import {
  getCachedSourcePagePreview,
  pageCacheKey,
  saveCachedSourcePagePreview,
  type PagePreviewLoadResult,
} from "@/lib/pdf-source-page-cache";
import type { SourcePagePreview } from "@/lib/highlightable-source";
import type { QuestionSourcePayload } from "@/lib/highlightable-source";

export type SourcePageState =
  | { status: "loading" }
  | {
      status: "ready";
      imageUrl: string;
      width: number;
      height: number;
      cacheSource: PagePreviewLoadResult["cacheSource"];
    }
  | { status: "error"; reason: string };

export function isServerPagePreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW !== "false";
}

const inFlightLoads = new Map<string, Promise<PagePreviewLoadResult | null>>();

export function resetSourcePageLoadGuards(): void {
  inFlightLoads.clear();
}

export async function fetchServerSourcePagePreview(
  fileId: string,
  pageNumber: number,
): Promise<SourcePagePreview | null> {
  if (!isServerPagePreviewEnabled()) {
    return null;
  }

  try {
    const response = await fetch(
      `/api/pdf/page-preview?fileId=${encodeURIComponent(fileId)}&pageNumber=${pageNumber}`,
    );

    if (response.ok) {
      return (await response.json()) as SourcePagePreview;
    }

    if (response.status === 404) {
      return null;
    }

    throw new Error(`page_preview_failed_${response.status}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("page_preview_failed_")) {
      throw error;
    }
    return null;
  }
}

export async function fetchQuestionSourcePayload(
  questionId: string,
): Promise<QuestionSourcePayload> {
  if (!questionId.trim()) {
    return { status: "not_ready", questionId, reason: "question_id_missing" };
  }

  const response = await fetch(
    `/api/questions/${encodeURIComponent(questionId)}/source`,
    { cache: "no-store" },
  );

  if (response.status === 404) {
    return { status: "not_ready", questionId, reason: "question_source_missing" };
  }

  if (!response.ok) {
    throw new Error(`question_source_failed_${response.status}`);
  }

  return (await response.json()) as QuestionSourcePayload;
}

async function loadSourcePagePreviewInternal(
  fileId: string,
  pageNumber: number,
): Promise<PagePreviewLoadResult | null> {
  const server = await fetchServerSourcePagePreview(fileId, pageNumber);
  if (server?.imageUrl) {
    return {
      imageUrl: server.imageUrl,
      width: server.width,
      height: server.height,
      cacheSource: "server",
    };
  }

  const local = await getCachedSourcePagePreview(fileId, pageNumber);
  if (local?.imageDataUrl) {
    return {
      imageUrl: local.imageDataUrl,
      width: local.width,
      height: local.height,
      cacheSource: "indexeddb",
    };
  }

  return null;
}

/** One in-flight load per fileId + pageNumber unless explicitly reset. */
export async function loadSourcePagePreview(
  fileId: string,
  pageNumber: number,
): Promise<PagePreviewLoadResult | null> {
  const requestKey = pageCacheKey(fileId, pageNumber);
  const existing = inFlightLoads.get(requestKey);
  if (existing) {
    return existing;
  }

  const promise = loadSourcePagePreviewInternal(fileId, pageNumber).finally(() => {
    inFlightLoads.delete(requestKey);
  });

  inFlightLoads.set(requestKey, promise);
  return promise;
}

export async function renderSourcePageWithPdfJs(args: {
  source: PdfSource;
  previewUrl: string;
  fileId?: string;
  pageNumber: number;
  scale?: number;
}): Promise<PagePreviewLoadResult> {
  const previewSource: PdfSource = {
    ...args.source,
    url: args.previewUrl,
    previewUrl: args.previewUrl,
  };
  const pdf = await openPdfDocument(previewSource, args.fileId);
  const page = await pdf.getPage(Math.min(Math.max(1, args.pageNumber), pdf.numPages));
  const scale = args.scale ?? 2;
  const renderViewport = page.getViewport({ scale });
  const cssViewport = createCssViewport(renderViewport, scale);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create canvas for PDF page render.");
  }

  canvas.width = renderViewport.width;
  canvas.height = renderViewport.height;
  await page.render({ canvasContext: context, viewport: renderViewport, canvas }).promise;

  return {
    imageUrl: canvas.toDataURL("image/jpeg", 0.88),
    width: cssViewport.width,
    height: cssViewport.height,
    cacheSource: "pdfjs",
  };
}

/**
 * Load a full PDF page image for the source viewer.
 * Always renders the real document page via PDF.js (client) — never SVG placeholders.
 */
export async function loadQuestionSourcePage(args: {
  questionId?: string;
  fileId?: string;
  pageNumber: number;
  source: PdfSource;
  previewUrl: string;
  renderPage?: typeof renderSourcePageWithPdfJs;
}): Promise<PagePreviewLoadResult> {
  const renderPage = args.renderPage ?? renderSourcePageWithPdfJs;

  if (args.fileId) {
    const cached = await loadSourcePagePreview(args.fileId, args.pageNumber);
    if (cached) {
      return cached;
    }
  }

  const rendered = await renderPage({
    source: args.source,
    previewUrl: args.previewUrl,
    fileId: args.fileId,
    pageNumber: args.pageNumber,
  });

  if (args.fileId) {
    void saveCachedSourcePagePreview({
      fileId: args.fileId,
      pageNumber: args.pageNumber,
      imageDataUrl: rendered.imageUrl,
      width: rendered.width,
      height: rendered.height,
    });
  }

  return rendered;
}
