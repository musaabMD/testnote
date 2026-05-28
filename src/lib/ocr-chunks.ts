import type { SourceChunk } from "@/lib/highlightable-source";
import type { MistralOcrPage } from "@/lib/mistral-ocr.server";

/**
 * Convert Mistral OCR page results into SourceChunks compatible with the
 * existing extraction pipeline.  Each page becomes one chunk that covers the
 * full page area so that batch splitting and question highlighting work
 * exactly the same as they do for selectable-text PDFs.
 */
export function ocrPagesToSourceChunks(
  pages: MistralOcrPage[],
  fileHash: string,
): SourceChunk[] {
  return pages
    .filter((page) => buildPageText(page).trim().length > 0)
    .map((page): SourceChunk => {
      const pageNumber = page.index + 1;
      // Fall back to A4 pixel dimensions at 72 dpi when Mistral doesn't return them
      const width = page.dimensions?.width ?? 595;
      const height = page.dimensions?.height ?? 842;

      return {
        id: `${fileHash}-ocr-p${pageNumber}`,
        pageNumber,
        text: buildPageText(page),
        region: {
          pageNumber,
          x: 0,
          y: 0,
          width,
          height,
          sourceKind: "page",
          method: "ocr-fallback",
          confidence: page.confidence_score,
        },
      };
    });
}

/** Concatenate header + body + footer into one page string. */
function buildPageText(page: MistralOcrPage): string {
  const parts: string[] = [];
  if (page.header?.trim()) parts.push(page.header.trim());
  if (page.markdown?.trim()) parts.push(page.markdown.trim());
  if (page.footer?.trim()) parts.push(page.footer.trim());
  return parts.join("\n\n");
}
