import type { SourceChunk } from "@/lib/highlightable-source";
import type { PdfFileQueueItem, PdfMcq, PdfMcqResult } from "@/lib/pdf-mcqs";

export type ConvexExtractionRecord = {
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  title: string;
  summary: string;
  mcqs: PdfMcq[];
  sourceChunks: SourceChunk[];
  createdAt: number;
  updatedAt: number;
};

export type LocalFileOverlay = {
  source?: PdfFileQueueItem["source"];
  pageCount?: number;
  addedAt?: number;
  addedBy?: string;
  examSlug?: string;
  examName?: string;
  resourceKind?: PdfFileQueueItem["resourceKind"];
};

export function convexRecordToQueueItem(
  record: ConvexExtractionRecord,
  overlay?: LocalFileOverlay,
): PdfFileQueueItem {
  const fileName = overlay?.source?.name ?? record.fileName ?? record.fileHash;
  const result: PdfMcqResult = {
    title: record.title,
    summary: record.summary,
    mcqs: record.mcqs,
  };

  return {
    id: record.fileHash,
    name: fileName,
    result,
    source: overlay?.source ?? {
      name: fileName,
      url: "",
      mimeType: inferMimeType(fileName),
    },
    status: "completed",
    pageCount: overlay?.pageCount ?? record.pageCount,
    addedAt: overlay?.addedAt ?? record.createdAt,
    addedBy: overlay?.addedBy ?? "You",
    examSlug: overlay?.examSlug,
    examName: overlay?.examName,
    resourceKind: overlay?.resourceKind,
    sourceChunks: record.sourceChunks,
  };
}

export function buildLocalOverlayMap(
  localFiles: PdfFileQueueItem[],
): Map<string, LocalFileOverlay> {
  const map = new Map<string, LocalFileOverlay>();

  for (const file of localFiles) {
    map.set(file.id, {
      source: file.source,
      pageCount: file.pageCount,
      addedAt: file.addedAt,
      addedBy: file.addedBy,
      examSlug: file.examSlug,
      examName: file.examName,
      resourceKind: file.resourceKind,
    });
  }

  return map;
}

export function mergeConvexRecordsWithLocal(
  records: ConvexExtractionRecord[],
  localFiles: PdfFileQueueItem[],
): PdfFileQueueItem[] {
  const overlayMap = buildLocalOverlayMap(localFiles);
  const seen = new Set<string>();
  const merged: PdfFileQueueItem[] = [];

  for (const record of records) {
    seen.add(record.fileHash);
    merged.push(convexRecordToQueueItem(record, overlayMap.get(record.fileHash)));
  }

  for (const local of localFiles) {
    if (!seen.has(local.id)) {
      merged.push(local);
    }
  }

  return merged.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
}

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/pdf";
}
