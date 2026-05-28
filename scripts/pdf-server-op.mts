import { readFileSync } from "node:fs";

import {
  extractSourceChunksFromPdfInProcess,
  extractSourcePagePacksFromPdfInProcess,
} from "../src/lib/pdf-source-chunks.server.ts";
import {
  getPdfPageCountInProcess,
  probePdfSelectableTextInProcess,
} from "../src/lib/pdf-text-probe.core.server.ts";

const op = process.argv[2];
const pdfPath = process.argv[3];
const fileId = process.argv[4];

if (!op || !pdfPath) {
  console.error("Usage: pdf-server-op.mts <probe|chunks|pagecount|pagepacks> <pdf-path> [fileId]");
  process.exit(1);
}

const fileBuffer = readFileSync(pdfPath);
const arrayBuffer = fileBuffer.buffer.slice(
  fileBuffer.byteOffset,
  fileBuffer.byteOffset + fileBuffer.byteLength,
);

let payload: unknown;

switch (op) {
  case "probe":
    payload = await probePdfSelectableTextInProcess(arrayBuffer);
    break;
  case "pagecount":
    payload = await getPdfPageCountInProcess(arrayBuffer);
    break;
  case "chunks":
    payload = await extractSourceChunksFromPdfInProcess(arrayBuffer, fileId);
    break;
  case "pagepacks":
    payload = await extractSourcePagePacksFromPdfInProcess(arrayBuffer, fileId);
    break;
  default:
    console.error(`Unknown op: ${op}`);
    process.exit(1);
}

process.stdout.write(JSON.stringify(payload));
