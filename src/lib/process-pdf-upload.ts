import {
  type PdfFileQueueItem,
  type PdfMcqResult,
} from "@/lib/pdf-mcqs";
import {
  buildHighlightableSourceFromUpload,
  highlightableSourceToPdfSource,
  type SourceChunk,
} from "@/lib/highlightable-source";
import { uploadSourceFileToConvex } from "@/lib/convex-source-file.client";
import { convex } from "@/lib/convex-client";
import { enrichQuestionsWithImages } from "@/lib/pdf-question-images";
import { saveSourceFile } from "@/lib/pdf-source-store";
import { loadPdfQuizSettings } from "@/lib/quiz-settings";
import { loadFiles, saveFileQueue } from "@/lib/pdf-view-storage";
import { buildRagDocumentText, buildRagSourceChunks } from "@/lib/source-rag";
import { assertSupportedUploadFiles } from "@/lib/upload-file-types";
import { api } from "../../convex/_generated/api";

export { filterSupportedUploadFiles, isSupportedUploadFile } from "@/lib/upload-file-types";

type ExtractionApiResponse = PdfMcqResult & {
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  sourceChunks?: SourceChunk[];
  error?: string;
  hint?: string;
};

type ExtractionJobStartResponse = {
  jobId: string;
  status: "queued" | "processing";
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  error?: string;
  hint?: string;
};

type ExtractionJobPollResponse = {
  jobId: string;
  status: "queued" | "processing" | "ready" | "failed";
  progressPagesProcessed: number;
  totalPages: number;
  fileHash: string;
  error?: string;
  hint?: string;
  failureReason?: string;
  result?: ExtractionApiResponse;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractionErrorMessage(payload: { error?: string; hint?: string }) {
  const message = payload.error ? payload.error : "File extraction failed.";
  return payload.hint ? `${message} ${payload.hint}` : message;
}

async function pollExtractionJob(jobId: string): Promise<ExtractionApiResponse> {
  const startedAt = Date.now();
  const timeoutMs = 12 * 60 * 1000;
  let delayMs = 1000;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(delayMs);
    const response = await fetch(
      `/api/pdf/mcqs/jobs/${encodeURIComponent(jobId)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | ExtractionJobPollResponse
      | null;

    if (!response.ok || !payload) {
      throw new Error("Could not check extraction status. Try again.");
    }

    if (payload.status === "failed") {
      throw new Error(extractionErrorMessage(payload));
    }

    if (payload.status === "ready" && payload.result) {
      return payload.result;
    }

    delayMs = Math.min(3000, Math.round(delayMs * 1.25));
  }

  throw new Error("Extraction is taking longer than expected. Try again shortly.");
}

async function getPageCountForFile(file: File): Promise<number> {
  if (file.type.startsWith("image/")) return 1;

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) return 1;

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    return pdf.numPages;
  } catch {
    return 1;
  }
}

export async function processPdfUploads(
  files: File[],
  options?: { append?: boolean; addedBy?: string },
): Promise<PdfFileQueueItem[]> {
  const supportedFiles = assertSupportedUploadFiles(files);
  if (!supportedFiles.length) {
    throw new Error("Choose at least one file to upload.");
  }

  const existingQueue = options?.append ? loadFiles() : [];
  const queue: PdfFileQueueItem[] = [...existingQueue];

  for (const file of supportedFiles) {
    const [pageCount, response] = await Promise.all([
      getPageCountForFile(file),
      (async () => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("extractionMode", loadPdfQuizSettings().extractionMode);
        return fetch("/api/pdf/mcqs", {
          method: "POST",
          body: formData,
        });
      })(),
    ]);

    const payload = (await response.json()) as
      | ExtractionApiResponse
      | ExtractionJobStartResponse;

    if (!response.ok) {
      throw new Error(extractionErrorMessage(payload));
    }

    const mcqResult =
      response.status === 202 && "jobId" in payload
        ? await pollExtractionJob(payload.jobId)
        : (payload as ExtractionApiResponse);

    if (!mcqResult.fileHash) {
      throw new Error("Upload succeeded but the server did not return a file id.");
    }

    const fileHash = mcqResult.fileHash;
    const addedAt = Date.now();
    await Promise.all([
      saveSourceFile(fileHash, file),
      uploadSourceFileToConvex(convex, file, fileHash),
    ]);

    const objectUrl = URL.createObjectURL(file);
    const highlightable = buildHighlightableSourceFromUpload(
      file,
      objectUrl,
      pageCount,
    );
    const source = highlightableSourceToPdfSource(highlightable, file.name);
    const enrichedMcqs = await enrichQuestionsWithImages(
      source,
      mcqResult.mcqs,
      fileHash,
    );
    const ragSourceChunks = buildRagSourceChunks({
      id: fileHash,
      name: file.name,
      sourceChunks: mcqResult.sourceChunks,
    });

    const existingIndex = queue.findIndex((item) => item.id === fileHash);
    const nextItem: PdfFileQueueItem = {
      id: fileHash,
      name: file.name,
      result: { ...mcqResult, mcqs: enrichedMcqs },
      source,
      sourceChunks: mcqResult.sourceChunks,
      ragSourceChunks,
      status: "completed",
      pageCount: mcqResult.pageCount ?? pageCount,
      addedAt,
      addedBy: options?.addedBy?.trim() || "You",
    };

    if (existingIndex >= 0) {
      queue[existingIndex] = nextItem;
    } else {
      queue.push(nextItem);
    }

    void indexSourceChunksForRag({
      fileHash,
      fileName: file.name,
      ragSourceChunks,
    });
  }

  saveFileQueue(queue);
  return queue;
}

async function indexSourceChunksForRag(args: {
  fileHash: string;
  fileName: string;
  ragSourceChunks: ReturnType<typeof buildRagSourceChunks>;
}): Promise<void> {
  if (!args.ragSourceChunks.length) return;

  try {
    await convex.action(api.studyRag.addStudyText, {
      fileHash: args.fileHash,
      fileName: args.fileName,
      source: "pdf",
      text: buildRagDocumentText(args.ragSourceChunks),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[study-rag] indexing failed:", error);
    }
  }
}
