import type { SourceChunk } from "@/lib/highlightable-source";
import { mapQuestionsToSourceChunks } from "@/lib/map-questions-to-chunks";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { getSourceFile } from "@/lib/pdf-source-store";
import { clearCachedSourcePagesForFile } from "@/lib/pdf-source-page-cache";
import { saveFileQueueItem } from "@/lib/pdf-view-storage";

export type ReprocessSourceRegionsResult = {
  file: PdfFileQueueItem;
  chunks: SourceChunk[];
  updatedCount: number;
  generatedPreviews: number;
  previewFailures: number;
};

export async function reprocessSourceRegionsForFile(
  file: PdfFileQueueItem,
): Promise<ReprocessSourceRegionsResult> {
  const stored = await getSourceFile(file.id);
  if (!stored?.data) {
    throw new Error("Original file is not available in this browser session. Re-upload the file.");
  }

  const blob = new Blob([stored.data], { type: stored.mimeType || "application/pdf" });
  const uploadFile = new File([blob], stored.name || file.name, {
    type: stored.mimeType || "application/pdf",
  });

  const formData = new FormData();
  formData.append("file", uploadFile);
  formData.append("fileId", file.id);

  const response = await fetch("/api/pdf/source-chunks", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as
    | { chunks: SourceChunk[]; error?: string }
    | { error: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Reprocess failed.");
  }

  const chunks = "chunks" in payload ? payload.chunks : [];
  const mappedMcqs = mapQuestionsToSourceChunks(file.result.mcqs, chunks);
  const updatedCount = mappedMcqs.filter((question, index) => {
    const previous = file.result.mcqs[index];
    return Boolean(question.sourceRegion && question.sourceRegion !== previous?.sourceRegion);
  }).length;

  let nextResult = {
    ...file.result,
    mcqs: mappedMcqs,
  };
  let generatedPreviews = 0;
  let previewFailures = 0;

  const previewResponse = await fetch("/api/pdf/source-previews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId: file.id,
      result: nextResult,
      sourceChunks: chunks,
    }),
  });
  const previewPayload = (await previewResponse.json()) as
    | {
        result: typeof nextResult;
        report?: { generatedPreviews?: number; previewFailures?: number };
      }
    | { error?: string };

  if (previewResponse.ok && "result" in previewPayload) {
    nextResult = previewPayload.result;
    generatedPreviews = previewPayload.report?.generatedPreviews ?? 0;
    previewFailures = previewPayload.report?.previewFailures ?? 0;
  } else {
    previewFailures = 1;
  }

  const nextFile: PdfFileQueueItem = {
    ...file,
    sourceChunks: chunks,
    result: nextResult,
  };

  saveFileQueueItem(nextFile);
  await clearCachedSourcePagesForFile(file.id);

  return {
    file: nextFile,
    chunks,
    updatedCount,
    generatedPreviews,
    previewFailures,
  };
}
