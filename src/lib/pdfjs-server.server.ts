import type { SourceChunk } from "@/lib/highlightable-source";
import {
  extractSourceChunksFromPdfInProcess,
  extractSourcePagePacksFromPdfInProcess,
  type SourcePagePack,
} from "@/lib/pdf-source-chunks.server";
import type { PdfTextProbeResult } from "@/lib/pdf-text-probe.core.server";
import {
  getPdfPageCountInProcess,
  probePdfSelectableTextInProcess,
} from "@/lib/pdf-text-probe.core.server";

/** Probe PDF text in-process on the Node.js server runtime. */
export async function probePdfSelectableText(
  pdfBytes: ArrayBuffer,
): Promise<PdfTextProbeResult> {
  return probePdfSelectableTextInProcess(pdfBytes);
}

/** Extract source chunks in-process on the Node.js server runtime. */
export async function extractSourceChunksFromPdf(
  pdfBytes: ArrayBuffer,
  fileId?: string,
): Promise<SourceChunk[]> {
  return extractSourceChunksFromPdfInProcess(pdfBytes, fileId);
}

export async function extractSourcePagePacksFromPdf(
  pdfBytes: ArrayBuffer,
  fileId?: string,
): Promise<SourcePagePack[]> {
  return extractSourcePagePacksFromPdfInProcess(pdfBytes, fileId);
}

/** Page count for upload quota estimation. */
export async function getPdfPageCountForUpload(pdfBytes: ArrayBuffer): Promise<number> {
  return getPdfPageCountInProcess(pdfBytes);
}

/** @deprecated Use getPdfPageCountForUpload — kept for callers expecting a document loader. */
export async function loadServerPdfDocument(pdfBytes: ArrayBuffer) {
  const pageCount = await getPdfPageCountForUpload(pdfBytes);
  return { numPages: pageCount };
}
