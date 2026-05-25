import { getSourceFile } from "@/lib/pdf-source-store";
import type { PdfSource } from "@/lib/pdf-mcqs";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocumentProxy = Awaited<
  ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>
>["promise"];

let workerConfigured = false;

export async function getPdfJs(): Promise<PdfJsModule> {
  const pdfjs = await import("pdfjs-dist");

  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    workerConfigured = true;
  }

  return pdfjs;
}

async function loadSourceBytes(
  source: PdfSource,
  fileId?: string,
): Promise<ArrayBuffer | null> {
  if (fileId) {
    const stored = await getSourceFile(fileId);
    if (stored?.data) {
      return stored.data.slice(0);
    }
  }

  const sourceUrl = source.dataUrl ?? source.url;
  if (!sourceUrl) return null;

  if (sourceUrl.startsWith("data:")) {
    return dataUrlToArrayBuffer(sourceUrl);
  }

  try {
    const response = await fetch(sourceUrl);
    if (response.ok) {
      return await response.arrayBuffer();
    }
  } catch {
    // Fall through to error below.
  }

  return null;
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match?.[1]) return null;

  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function openPdfDocument(
  source: PdfSource,
  fileId?: string,
): Promise<PdfDocumentProxy> {
  const pdfjs = await getPdfJs();
  const bytes = await loadSourceBytes(source, fileId);

  if (bytes?.byteLength) {
    return pdfjs.getDocument({ data: bytes }).promise;
  }

  const sourceUrl = source.dataUrl ?? source.url;
  if (sourceUrl) {
    return pdfjs.getDocument({ url: sourceUrl }).promise;
  }

  throw new Error(
    fileId
      ? "Original PDF is not available in this browser session. Re-upload the file to view it."
      : "PDF source is missing.",
  );
}

export async function renderPdfPagePreview(
  source: PdfSource,
  fileId?: string,
  pageNumber = 1,
  scale = 2,
): Promise<string | null> {
  try {
    await getPdfJs();
    const pdf = await openPdfDocument(source, fileId);
    const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    if (!context) return null;

    await page.render({ canvasContext: context, viewport, canvas }).promise;
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return null;
  }
}

export async function getPdfPageCount(source: PdfSource, fileId?: string): Promise<number> {
  try {
    const pdf = await openPdfDocument(source, fileId);
    return pdf.numPages;
  } catch {
    return 1;
  }
}
