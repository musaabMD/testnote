import { loadServerPdfDocument } from "@/lib/pdfjs-node.server";

export type PdfTextProbeResult = {
  pageCount: number;
  sampledPages: number[];
  sampledTextItemCount: number;
  sampledTextCharCount: number;
  pdfOpened: boolean;
  probeError?: string;
};

export const SELECTABLE_TEXT_MIN_ITEMS = 10;
export const SELECTABLE_TEXT_MIN_CHARS = 100;

export function hasSelectableText(probe: PdfTextProbeResult): boolean {
  return (
    probe.pdfOpened &&
    (probe.sampledTextItemCount >= SELECTABLE_TEXT_MIN_ITEMS ||
      probe.sampledTextCharCount >= SELECTABLE_TEXT_MIN_CHARS)
  );
}

function pickSamplePages(pageCount: number): number[] {
  if (pageCount <= 0) return [];
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const middle = Math.ceil(pageCount / 2);
  return [...new Set([1, 2, 3, middle, pageCount])].sort((a, b) => a - b);
}

/** In-process probe — used by the PDF subprocess, not Next.js routes directly. */
export async function probePdfSelectableTextInProcess(
  pdfBytes: ArrayBuffer,
): Promise<PdfTextProbeResult> {
  try {
    const pdf = await loadServerPdfDocument(pdfBytes);
    const sampledPages = pickSamplePages(pdf.numPages);
    let sampledTextItemCount = 0;
    let sampledTextCharCount = 0;

    for (const pageNumber of sampledPages) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!item || typeof item !== "object") continue;
        const str = (item as { str?: unknown }).str;
        if (typeof str !== "string" || !str.trim()) continue;
        sampledTextItemCount += 1;
        sampledTextCharCount += str.trim().length;
      }
    }

    return {
      pageCount: pdf.numPages,
      sampledPages,
      sampledTextItemCount,
      sampledTextCharCount,
      pdfOpened: true,
    };
  } catch (error) {
    return {
      pageCount: 0,
      sampledPages: [],
      sampledTextItemCount: 0,
      sampledTextCharCount: 0,
      pdfOpened: false,
      probeError: error instanceof Error ? error.message : "PDF probe failed",
    };
  }
}

export async function getPdfPageCountInProcess(pdfBytes: ArrayBuffer): Promise<number> {
  try {
    const pdf = await loadServerPdfDocument(pdfBytes);
    return pdf.numPages;
  } catch {
    return 1;
  }
}
