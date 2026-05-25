import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

type LegacyPdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsModule: LegacyPdfJs | null = null;
let workerConfigured = false;

function pdfjsPackageDir() {
  return path.dirname(require.resolve("pdfjs-dist/package.json"));
}

function assetPath(relativePath: string) {
  return `${path.join(pdfjsPackageDir(), relativePath)}${path.sep}`;
}

/** In-process pdfjs loader for plain Node (subprocess script). */
export async function getServerPdfJs(): Promise<LegacyPdfJs> {
  if (!pdfjsModule) {
    const pdfjsPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsModule = await import(pathToFileURL(pdfjsPath).href);
  }

  if (!pdfjsModule) {
    throw new Error("Failed to load pdfjs-dist on the server.");
  }

  if (!workerConfigured) {
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjsModule.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    workerConfigured = true;
  }

  return pdfjsModule;
}

export async function loadServerPdfDocument(pdfBytes: ArrayBuffer) {
  const pdfjs = await getServerPdfJs();

  return pdfjs.getDocument({
    data: pdfBytes.slice(0),
    standardFontDataUrl: assetPath("standard_fonts"),
    wasmUrl: assetPath("wasm"),
  }).promise;
}
