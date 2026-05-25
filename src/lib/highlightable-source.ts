import type { PdfSource } from "@/lib/pdf-mcqs";

export type PreviewMimeType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";

export type SourceKind = "question-block" | "text-line" | "page";

export type SourceRegionMethod =
  | "stored"
  | "pdf-layout"
  | "converted-pdf-layout"
  | "vision-layout"
  | "ocr-fallback"
  | "manual";

export type SourceRegion = {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceKind: SourceKind;
  method: SourceRegionMethod;
  confidence?: number;
};

export type SourceChunk = {
  id: string;
  fileId?: string;
  pageNumber: number;
  text: string;
  region: SourceRegion;
};

export type SourcePagePreview = {
  id: string;
  fileId: string;
  pageNumber: number;
  imageUrl: string;
  width: number;
  height: number;
};

export type QuestionSourcePayload =
  | {
      status: "ready";
      questionId: string;
      fileId: string;
      sourcePagePreviewId: string;
      pageNumber: number;
      imageUrl: string;
      width: number;
      height: number;
      sourceRegion: SourceRegion;
      highlightConfirmed: boolean;
    }
  | {
      status: "not_ready";
      questionId: string;
      reason:
        | "question_id_missing"
        | "question_source_missing"
        | "source_region_missing"
        | "source_page_preview_missing"
        | "source_region_invalid";
    };

export type HighlightableSource = {
  originalFileUrl: string;
  originalMimeType: string;
  previewUrl: string;
  previewMimeType: PreviewMimeType;
  pageCount: number;
};

/** Minimum confidence to draw a highlight. Below this, show page only. */
export const MIN_HIGHLIGHT_CONFIDENCE = 0.5;

export function isHighlightConfidenceSufficient(confidence?: number): boolean {
  if (confidence === undefined) return true;
  return confidence >= MIN_HIGHLIGHT_CONFIDENCE;
}

function inferPreviewMimeType(source: PdfSource): PreviewMimeType {
  const mime = source.previewMimeType ?? source.mimeType ?? "";
  if (mime === "application/pdf" || source.name.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }
  if (mime === "image/jpeg" || /\.jpe?g$/i.test(source.name)) return "image/jpeg";
  if (mime === "image/webp" || /\.webp$/i.test(source.name)) return "image/webp";
  return "image/png";
}

export function getSourcePreview(source: PdfSource): {
  previewUrl: string;
  previewMimeType: PreviewMimeType;
} {
  return {
    previewUrl: source.previewUrl ?? source.url,
    previewMimeType: inferPreviewMimeType(source),
  };
}

export function isPdfPreviewMime(mimeType: string) {
  return mimeType === "application/pdf";
}

export function isImagePreviewMime(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function buildHighlightableSourceFromUpload(
  file: File,
  objectUrl: string,
  pageCount: number,
): HighlightableSource {
  const originalMimeType = file.type || inferMimeTypeFromName(file.name);
  const isPdf =
    originalMimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = originalMimeType.startsWith("image/");

  if (isPdf) {
    return {
      originalFileUrl: objectUrl,
      originalMimeType,
      previewUrl: objectUrl,
      previewMimeType: "application/pdf",
      pageCount,
    };
  }

  if (isImage) {
    const previewMimeType: PreviewMimeType =
      originalMimeType === "image/jpeg"
        ? "image/jpeg"
        : originalMimeType === "image/webp"
          ? "image/webp"
          : "image/png";

    return {
      originalFileUrl: objectUrl,
      originalMimeType,
      previewUrl: objectUrl,
      previewMimeType,
      pageCount: 1,
    };
  }

  return {
    originalFileUrl: objectUrl,
    originalMimeType,
    previewUrl: objectUrl,
    previewMimeType: "application/pdf",
    pageCount,
  };
}

export function highlightableSourceToPdfSource(
  highlightable: HighlightableSource,
  fileName: string,
): PdfSource {
  return {
    name: fileName,
    url: highlightable.originalFileUrl,
    mimeType: highlightable.originalMimeType,
    previewUrl: highlightable.previewUrl,
    previewMimeType: highlightable.previewMimeType,
  };
}

export function inferMimeTypeFromName(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "heic") return "image/heic";
  if (extension === "doc") return "application/msword";
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "txt") return "text/plain";
  if (extension === "rtf") return "application/rtf";
  return "application/octet-stream";
}

/** Normalize legacy regions missing sourceKind/method. */
export function normalizeSourceRegion(
  region: Partial<SourceRegion> | null | undefined,
  pageNumber = 1,
): SourceRegion | null {
  if (!region) return null;
  const { x, y, width, height } = region;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }

  const legacyMethod = (region as { method?: string }).method;
  let method: SourceRegionMethod = region.method ?? "stored";
  if (legacyMethod === "pdf-text") method = "pdf-layout";
  if (legacyMethod === "ai") method = "stored";
  if (legacyMethod === "ocr") method = "ocr-fallback";

  return {
    pageNumber: region.pageNumber ?? pageNumber,
    x,
    y,
    width,
    height,
    sourceKind: region.sourceKind ?? "question-block",
    method,
    confidence: region.confidence,
  };
}
