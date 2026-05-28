import {
  type PdfFileQueueItem,
  type PdfMcqResult,
} from "@/lib/pdf-mcqs";
import {
  buildHighlightableSourceFromUpload,
  highlightableSourceToPdfSource,
  type SourceChunk,
} from "@/lib/highlightable-source";
import { convex } from "@/lib/convex-client";
import { enrichQuestionsWithImages } from "@/lib/pdf-question-images";
import { saveSourceFile } from "@/lib/pdf-source-store";
import { loadPdfQuizSettings } from "@/lib/quiz-settings";
import { loadFiles, saveFileQueue } from "@/lib/pdf-view-storage";
import { buildRagDocumentText, buildRagSourceChunks } from "@/lib/source-rag";
import { assertSupportedUploadFiles } from "@/lib/upload-file-types";
import { captureConversionEvent } from "@/lib/conversion-analytics";
import {
  patchUploadProgressRecord,
  upsertUploadProgressRecord,
  type UploadProgressRecord,
} from "@/lib/upload-progress";
import { api } from "../../convex/_generated/api";

export { filterSupportedUploadFiles, isSupportedUploadFile } from "@/lib/upload-file-types";

export type ExtractionApiResponse = PdfMcqResult & {
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  sourceChunks?: SourceChunk[];
  error?: string;
  hint?: string;
  failureReason?: string;
};

type ExtractionJobStartResponse = {
  jobId: string;
  status: "queued" | "processing";
  fileHash: string;
  fileName?: string;
  pageCount?: number;
  inFlightHit?: boolean;
  error?: string;
  hint?: string;
  failureReason?: string;
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

export async function pollExtractionJob(
  jobId: string,
  options?: { uploadProgressId?: string },
): Promise<ExtractionApiResponse> {
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
      if (options?.uploadProgressId) {
        patchUploadProgressRecord(options.uploadProgressId, {
          status: "failed",
          error: extractionErrorMessage(payload),
          progressPagesProcessed: payload.progressPagesProcessed,
          totalPages: payload.totalPages,
        });
      }
      throw new Error(extractionErrorMessage(payload));
    }

    if (payload.status === "ready" && payload.result) {
      if (options?.uploadProgressId) {
        patchUploadProgressRecord(options.uploadProgressId, {
          status: "finalizing",
          phase: "saving_results",
          fileHash: payload.fileHash,
          progressPagesProcessed: payload.totalPages,
          totalPages: payload.totalPages,
        });
      }
      return payload.result;
    }

    if (options?.uploadProgressId) {
      patchUploadProgressRecord(options.uploadProgressId, {
        status: payload.status,
        phase:
          payload.status === "queued"
            ? "queued"
            : payload.progressPagesProcessed > 0
              ? "extracting_questions"
              : "reading_pages",
        fileHash: payload.fileHash,
        progressPagesProcessed: payload.progressPagesProcessed,
        totalPages: payload.totalPages,
      });
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

function inferFileExtension(fileName: string, mimeType: string) {
  const match = fileName.match(/\.([a-zA-Z0-9]{1,12})$/);
  if (match?.[1]) return match[1].toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "text/markdown") return "md";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1] || "png";
  return "bin";
}

function safeMultipartFileName(file: File) {
  const extension = inferFileExtension(file.name, file.type);
  const base = file.name
    .replace(/\.[^/.]+$/, "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "upload"}.${extension}`;
}

function fileSizeMb(file: File) {
  return Math.round((file.size / (1024 * 1024)) * 100) / 100;
}

function currentPath() {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

function remoteSourceForResult(result: ExtractionApiResponse) {
  const fileName = result.fileName ?? result.fileHash;
  return {
    name: fileName,
    url: `/api/pdf/source-file/download?fileId=${encodeURIComponent(result.fileHash)}`,
    previewUrl: `/api/pdf/source-file/download?fileId=${encodeURIComponent(result.fileHash)}`,
    mimeType: fileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/octet-stream",
  };
}

async function finalizeExtractionResult(args: {
  result: ExtractionApiResponse;
  queue: PdfFileQueueItem[];
  file?: File;
  pageCount?: number;
  addedBy?: string;
  examSlug?: string;
  examName?: string;
}): Promise<PdfFileQueueItem[]> {
  const fileHash = args.result.fileHash;
  const fileName = args.result.fileName ?? args.file?.name ?? fileHash;
  const addedAt = Date.now();
  let source: PdfFileQueueItem["source"] = remoteSourceForResult({
    ...args.result,
    fileName,
  });
  let enrichedMcqs = args.result.mcqs;

  if (args.file) {
    await saveSourceFile(fileHash, args.file);

    const objectUrl = URL.createObjectURL(args.file);
    const highlightable = buildHighlightableSourceFromUpload(
      args.file,
      objectUrl,
      args.pageCount ?? args.result.pageCount ?? 1,
    );
    source = highlightableSourceToPdfSource(highlightable, fileName);
    enrichedMcqs = await enrichQuestionsWithImages(
      source,
      args.result.mcqs,
      fileHash,
    );
  }

  const ragSourceChunks = buildRagSourceChunks({
    id: fileHash,
    name: fileName,
    sourceChunks: args.result.sourceChunks,
  });

  const existingIndex = args.queue.findIndex((item) => item.id === fileHash);
  const nextItem: PdfFileQueueItem = {
    id: fileHash,
    name: fileName,
    result: { ...args.result, mcqs: enrichedMcqs },
    source,
    sourceChunks: args.result.sourceChunks,
    ragSourceChunks,
    status: "completed",
    pageCount: args.result.pageCount ?? args.pageCount,
    addedAt,
    addedBy: args.addedBy?.trim() || "You",
    examSlug: args.examSlug?.trim() || undefined,
    examName: args.examName?.trim() || undefined,
  };

  const nextQueue =
    existingIndex >= 0
      ? args.queue.map((item, index) => (index === existingIndex ? nextItem : item))
      : [...args.queue, nextItem];

  void indexSourceChunksForRag({
    fileHash,
    fileName,
    ragSourceChunks,
  });

  return nextQueue;
}

export async function processPdfUploads(
  files: File[],
  options?: {
    append?: boolean;
    addedBy?: string;
    examSlug?: string;
    examName?: string;
    onJobStarted?: (record: UploadProgressRecord) => void;
  },
): Promise<PdfFileQueueItem[]> {
  const supportedFiles = assertSupportedUploadFiles(files);
  if (!supportedFiles.length) {
    throw new Error("Choose at least one file to upload.");
  }

  const existingQueue = options?.append ? loadFiles() : [];
  const queue: PdfFileQueueItem[] = [...existingQueue];

  for (const file of supportedFiles) {
    const startedAt = Date.now();
    let failureTracked = false;
    const uploadProgressId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    upsertUploadProgressRecord({
      id: uploadProgressId,
      fileName: file.name,
      fileSize: file.size,
      status: "uploading",
      phase: "checking_file",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    captureConversionEvent("first_upload_started", {
      file_type: file.type || inferFileExtension(file.name, file.type),
      file_size_mb: fileSizeMb(file),
      source_path: currentPath(),
    });

    try {
      const pageCountPromise = getPageCountForFile(file).then((pageCount) => {
        patchUploadProgressRecord(uploadProgressId, {
          phase: "uploading_file",
          totalPages: pageCount,
          progressPagesProcessed: 0,
        });
        return pageCount;
      });

      patchUploadProgressRecord(uploadProgressId, {
        phase: "counting_pages",
      });

      const responsePromise = (async () => {
        const formData = new FormData();
        formData.append("file", file, safeMultipartFileName(file));
        formData.append("fileName", file.name);
        formData.append("extractionMode", loadPdfQuizSettings().extractionMode);
        return fetch("/api/pdf/mcqs", {
          method: "POST",
          body: formData,
        });
      })();

      const [pageCount, response] = await Promise.all([
        pageCountPromise,
        responsePromise,
      ]);

      const payload = (await response.json()) as
        | ExtractionApiResponse
        | ExtractionJobStartResponse;

      if (!response.ok) {
        failureTracked = true;
        captureConversionEvent("first_extraction_failed", {
          failure_reason:
            "failureReason" in payload && payload.failureReason
              ? payload.failureReason
              : extractionErrorMessage(payload),
          file_type: file.type || inferFileExtension(file.name, file.type),
          file_size_mb: fileSizeMb(file),
          page_count: pageCount,
        });
        throw new Error(extractionErrorMessage(payload));
      }

      if (response.status === 202 && "jobId" in payload) {
        const record = patchUploadProgressRecord(uploadProgressId, {
          status: payload.status,
          phase: payload.status === "queued" ? "queued" : "reading_pages",
          jobId: payload.jobId,
          fileHash: payload.fileHash,
          totalPages: payload.pageCount ?? pageCount,
          progressPagesProcessed: 0,
        });
        if (record) options?.onJobStarted?.(record);
      }

      const mcqResult =
        response.status === 202 && "jobId" in payload
          ? await pollExtractionJob(payload.jobId, { uploadProgressId })
          : (payload as ExtractionApiResponse);

      if (!mcqResult.fileHash) {
        throw new Error("Upload succeeded but the server did not return a file id.");
      }

      const nextQueue = await finalizeExtractionResult({
        result: { ...mcqResult, fileName: mcqResult.fileName ?? file.name },
        queue,
        file,
        pageCount,
        addedBy: options?.addedBy,
        examSlug: options?.examSlug,
        examName: options?.examName,
      });
      queue.splice(0, queue.length, ...nextQueue);

      patchUploadProgressRecord(uploadProgressId, {
        status: "ready",
        phase: "saving_results",
        fileHash: mcqResult.fileHash,
        progressPagesProcessed: mcqResult.pageCount ?? pageCount,
        totalPages: mcqResult.pageCount ?? pageCount,
      });
      captureConversionEvent("first_extraction_completed", {
        duration_seconds: Math.round((Date.now() - startedAt) / 100) / 10,
        question_count: mcqResult.mcqs.length,
        page_count: mcqResult.pageCount ?? pageCount,
        file_type: file.type || inferFileExtension(file.name, file.type),
        used_cache: response.status !== 202,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "File extraction failed.";
      patchUploadProgressRecord(uploadProgressId, {
        status: "failed",
        error: message,
      });
      if (!failureTracked) {
        captureConversionEvent("first_extraction_failed", {
          failure_reason: message,
          file_type: file.type || inferFileExtension(file.name, file.type),
          file_size_mb: fileSizeMb(file),
        });
      }
      throw error;
    }
  }

  saveFileQueue(queue);
  return queue;
}

export async function resumePersistedExtractionJob(
  record: UploadProgressRecord,
  options?: { append?: boolean; addedBy?: string },
): Promise<PdfFileQueueItem[] | null> {
  if (!record.jobId) return null;

  try {
    const result = await pollExtractionJob(record.jobId, {
      uploadProgressId: record.id,
    });
    const queue = await finalizeExtractionResult({
      result: {
        ...result,
        fileName: result.fileName ?? record.fileName,
      },
      queue: options?.append === false ? [] : loadFiles(),
      addedBy: options?.addedBy,
    });
    saveFileQueue(queue);
    patchUploadProgressRecord(record.id, {
      status: "ready",
      fileHash: result.fileHash,
      progressPagesProcessed: result.pageCount,
      totalPages: result.pageCount,
    });
    return queue;
  } catch (error) {
    patchUploadProgressRecord(record.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "File extraction failed.",
    });
    return null;
  }
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
