import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SourceChunk } from "@/lib/highlightable-source";
import type { PdfTextProbeResult } from "@/lib/pdf-text-probe.core.server";

const SUBPROCESS_SCRIPT = path.join(process.cwd(), "scripts/pdf-server-op.mts");

type PdfServerOp = "probe" | "chunks" | "pagecount";

function runPdfServerSubprocess<T>(op: PdfServerOp, pdfBytes: ArrayBuffer, fileId?: string): T {
  const dir = mkdtempSync(path.join(tmpdir(), "testnote-pdf-"));
  const pdfPath = path.join(dir, "input.pdf");

  try {
    writeFileSync(pdfPath, Buffer.from(pdfBytes));
    const args = ["tsx", SUBPROCESS_SCRIPT, op, pdfPath];
    if (fileId) args.push(fileId);

    const result = spawnSync("npx", args, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      env: process.env,
    });

    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "").trim();
      throw new Error(detail || `PDF ${op} subprocess failed`);
    }

    const stdout = result.stdout.trim();
    if (!stdout) {
      throw new Error(`PDF ${op} subprocess returned empty output`);
    }

    return JSON.parse(stdout) as T;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Probe PDF text outside the Next.js bundle (avoids Turbopack/pdfjs worker issues). */
export async function probePdfSelectableText(
  pdfBytes: ArrayBuffer,
): Promise<PdfTextProbeResult> {
  return runPdfServerSubprocess<PdfTextProbeResult>("probe", pdfBytes);
}

/** Extract source chunks outside the Next.js bundle. */
export async function extractSourceChunksFromPdf(
  pdfBytes: ArrayBuffer,
  fileId?: string,
): Promise<SourceChunk[]> {
  return runPdfServerSubprocess<SourceChunk[]>("chunks", pdfBytes, fileId);
}

/** Page count for upload quota estimation. */
export async function getPdfPageCountForUpload(pdfBytes: ArrayBuffer): Promise<number> {
  return runPdfServerSubprocess<number>("pagecount", pdfBytes);
}

/** @deprecated Use getPdfPageCountForUpload — kept for callers expecting a document loader. */
export async function loadServerPdfDocument(pdfBytes: ArrayBuffer) {
  const pageCount = await getPdfPageCountForUpload(pdfBytes);
  return { numPages: pageCount };
}
