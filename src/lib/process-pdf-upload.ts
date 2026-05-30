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
import { uploadSourceFileToConvex } from "@/lib/convex-source-file.client";
import { enrichQuestionsWithImages } from "@/lib/pdf-question-images";
import { saveSourceFile } from "@/lib/pdf-source-store";
import { loadPdfQuizSettings } from "@/lib/quiz-settings";
import { loadFiles, saveFileQueue } from "@/lib/pdf-view-storage";
import { buildRagDocumentText, buildRagSourceChunks } from "@/lib/source-rag";
import {
  assertSupportedUploadFiles,
  inferUploadMimeTypeFromName,
} from "@/lib/upload-file-types";
import { logUploadPipeline } from "@/lib/upload-pipeline-trace";
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

const VERCEL_FUNCTION_BODY_SAFE_BYTES = 4 * 1024 * 1024;

type ExtractionJobStartResponse = {
  uploadTraceId?: string;
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
  uploadTraceId?: string;
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

type ExtractionUploadResponse = (
  | ExtractionApiResponse
  | ExtractionJobStartResponse
) & {
  error?: string;
  hint?: string;
  failureReason?: string;
};

class ExtractionStatusCheckError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, options?: { retryable?: boolean; status?: number }) {
    super(message);
    this.name = "ExtractionStatusCheckError";
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractionErrorMessage(payload: { error?: string; hint?: string }) {
  const message = payload.error ? payload.error : "File extraction failed.";
  return payload.hint ? `${message} ${payload.hint}` : message;
}

function isBackgroundExtractionInProgressMessage(message: string) {
  return /extraction is already processing/i.test(message);
}

async function readExtractionUploadResponse(
  response: Response,
): Promise<ExtractionUploadResponse | null> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as ExtractionUploadResponse;
  } catch {
    return {
      error: response.ok
        ? "Upload response was not valid JSON."
        : text.slice(0, 300),
      failureReason: "invalid_server_response",
    } as ExtractionUploadResponse;
  }
}

function isRetryableStatusCheck(status: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

async function fetchExtractionJobStatus(
  jobId: string,
): Promise<ExtractionJobPollResponse> {
  let response: Response;

  try {
    response = await fetch(`/api/pdf/mcqs/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    });
  } catch {
    throw new ExtractionStatusCheckError(
      "Could not reach extraction status. Retrying...",
      { retryable: true },
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | ExtractionJobPollResponse
    | null;

  if (!response.ok || !payload) {
    const message =
      payload && "error" in payload && payload.error
        ? extractionErrorMessage(payload)
        : "Could not check extraction status. Retrying...";
    throw new ExtractionStatusCheckError(message, {
      retryable: isRetryableStatusCheck(response.status),
      status: response.status,
    });
  }

  return payload;
}

export async function pollExtractionJob(
  jobId: string,
  options?: { uploadProgressId?: string },
): Promise<ExtractionApiResponse> {
  const startedAt = Date.now();
  const timeoutMs = 12 * 60 * 1000;
  let delayMs = 1000;
  let statusCheckFailures = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(delayMs);

    let payload: ExtractionJobPollResponse;
    try {
      payload = await fetchExtractionJobStatus(jobId);
      statusCheckFailures = 0;
    } catch (error) {
      if (error instanceof ExtractionStatusCheckError && error.retryable) {
        statusCheckFailures += 1;
        if (options?.uploadProgressId) {
          patchUploadProgressRecord(options.uploadProgressId, {
            status: "processing",
            phase: "checking_status",
          });
        }
        delayMs = Math.min(10_000, Math.round(delayMs * 1.5));
        continue;
      }

      throw error;
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

    delayMs =
      statusCheckFailures > 0 ? delayMs : Math.min(3000, Math.round(delayMs * 1.25));
  }

  throw new Error(
    "Extraction is taking longer than expected. It may still finish in the background.",
  );
}

async function getPageCountForFile(
  file: File,
  arrayBuffer?: ArrayBuffer,
): Promise<number> {
  if (file.type.startsWith("image/")) return 1;

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) return 1;

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
    const pdf = await pdfjs.getDocument({
      data: arrayBuffer ?? (await file.arrayBuffer()),
    }).promise;
    return pdf.numPages;
  } catch {
    return 1;
  }
}

async function sha256ArrayBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    backgroundOnJobStarted?: boolean;
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
    const uploadTraceId = crypto.randomUUID();
    const uploadProgressId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    console.time(`[upload ${uploadTraceId}] total`);
    logUploadPipeline(uploadTraceId, "browser_upload_started", {
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || inferFileExtension(file.name, file.type),
    });
    upsertUploadProgressRecord({
      id: uploadProgressId,
      fileName: file.name,
      fileSize: file.size,
      status: "uploading",
      phase: "checking_file",
      uploadTraceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    captureConversionEvent("first_upload_started", {
      file_type: file.type || inferFileExtension(file.name, file.type),
      file_size_mb: fileSizeMb(file),
      source_path: currentPath(),
    });

    try {
      const fileBytesPromise = file.arrayBuffer();
      const pageCountPromise = fileBytesPromise.then((arrayBuffer) =>
        getPageCountForFile(file, arrayBuffer),
      ).then((pageCount) => {
        patchUploadProgressRecord(uploadProgressId, {
          phase: "uploading_file",
          totalPages: pageCount,
          progressPagesProcessed: 0,
        });
        return pageCount;
      });
      const fileHashPromise = fileBytesPromise.then(sha256ArrayBuffer);

      patchUploadProgressRecord(uploadProgressId, {
        phase: "counting_pages",
      });

      const [pageCount, fileHash] = await Promise.all([
        pageCountPromise,
        fileHashPromise,
      ]);
      logUploadPipeline(uploadTraceId, "browser_file_prepared", {
        fileHash,
        pageCount,
      });

      patchUploadProgressRecord(uploadProgressId, {
        phase: "uploading_file",
        uploadTraceId,
        fileHash,
        totalPages: pageCount,
        progressPagesProcessed: 0,
      });

      logUploadPipeline(uploadTraceId, "browser_source_upload_start", {
        fileHash,
      });
      const sourceStored = await uploadSourceFileToConvex(convex, file, fileHash);
      logUploadPipeline(uploadTraceId, "browser_source_upload_done", {
        fileHash,
        sourceStored,
      });
      logUploadPipeline(uploadTraceId, "browser_api_request_start", {
        sourceAlreadyStored: sourceStored,
      });
      const response = sourceStored
        ? await fetch("/api/pdf/mcqs", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              uploadTraceId,
              sourceAlreadyStored: true,
              fileHash,
              fileName: file.name,
              mimeType: file.type || inferFileExtension(file.name, file.type),
              fileSizeBytes: file.size,
              pageCount,
              extractionMode: loadPdfQuizSettings().extractionMode,
            }),
          })
        : await (async () => {
            if (file.size > VERCEL_FUNCTION_BODY_SAFE_BYTES) {
              throw new Error(
                "Could not upload the file directly to storage. Sign in and try again, or upload a smaller file.",
              );
            }

            const formData = new FormData();
            formData.append("file", file, safeMultipartFileName(file));
            formData.append("fileName", file.name);
            formData.append("uploadTraceId", uploadTraceId);
            formData.append("extractionMode", loadPdfQuizSettings().extractionMode);
            return fetch("/api/pdf/mcqs", {
              method: "POST",
              body: formData,
            });
          })();

      const payload = await readExtractionUploadResponse(response);
      logUploadPipeline(uploadTraceId, "browser_api_response", {
        status: response.status,
        jobId: payload && "jobId" in payload ? payload.jobId : undefined,
        failureReason:
          payload && "failureReason" in payload ? payload.failureReason : undefined,
      });

      if (!payload) {
        const message = response.ok
          ? "Upload succeeded but the server returned an empty response."
          : "Upload failed temporarily. Please try again.";
        if (!response.ok) {
          failureTracked = true;
          captureConversionEvent("first_extraction_failed", {
            failure_reason: `http_${response.status}_empty_response`,
            file_type: file.type || inferFileExtension(file.name, file.type),
            file_size_mb: fileSizeMb(file),
            page_count: pageCount,
          });
        }
        throw new Error(message);
      }

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
          uploadTraceId,
          jobId: payload.jobId,
          fileHash: payload.fileHash,
          totalPages: payload.pageCount ?? pageCount,
          progressPagesProcessed: 0,
        });
        logUploadPipeline(uploadTraceId, "browser_job_started", {
          jobId: payload.jobId,
          status: payload.status,
        });
        if (record) options?.onJobStarted?.(record);
        if (options?.backgroundOnJobStarted) {
          continue;
        }
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
        uploadTraceId,
        fileHash: mcqResult.fileHash,
        progressPagesProcessed: mcqResult.pageCount ?? pageCount,
        totalPages: mcqResult.pageCount ?? pageCount,
      });
      logUploadPipeline(uploadTraceId, "browser_result_ready", {
        fileHash: mcqResult.fileHash,
        questionCount: mcqResult.mcqs.length,
        pageCount: mcqResult.pageCount ?? pageCount,
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
      if (isBackgroundExtractionInProgressMessage(message)) {
        patchUploadProgressRecord(uploadProgressId, {
          status: "processing",
          phase: "checking_status",
          error: undefined,
        });
        continue;
      }
      patchUploadProgressRecord(uploadProgressId, {
        status: "failed",
        uploadTraceId,
        error: message,
      });
      logUploadPipeline(uploadTraceId, "browser_upload_failed", {
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
    } finally {
      console.timeEnd(`[upload ${uploadTraceId}] total`);
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
    const message =
      error instanceof Error ? error.message : "File extraction failed.";

    if (isBackgroundExtractionInProgressMessage(message)) {
      try {
        const result = await restartStoredSourceExtraction(record);
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
      } catch (retryError) {
        patchUploadProgressRecord(record.id, {
          status: "failed",
          error:
            retryError instanceof Error
              ? retryError.message
              : "File extraction failed.",
        });
        return null;
      }
    }

    patchUploadProgressRecord(record.id, {
      status: "failed",
      error: message,
    });
    return null;
  }
}

async function restartStoredSourceExtraction(
  record: UploadProgressRecord,
): Promise<ExtractionApiResponse> {
  if (!record.fileHash) {
    throw new Error("Upload is missing a file id. Upload the file again.");
  }

  patchUploadProgressRecord(record.id, {
    status: "queued",
    phase: "queued",
    error: undefined,
  });

  const response = await fetch("/api/pdf/mcqs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uploadTraceId: record.uploadTraceId,
      sourceAlreadyStored: true,
      fileHash: record.fileHash,
      fileName: record.fileName,
      mimeType: inferUploadMimeTypeFromName(record.fileName),
      fileSizeBytes: record.fileSize,
      pageCount: record.totalPages ?? 1,
      extractionMode: loadPdfQuizSettings().extractionMode,
    }),
  });
  const payload = await readExtractionUploadResponse(response);

  if (!payload) {
    throw new Error(
      response.ok
        ? "Upload succeeded but the server returned an empty response."
        : "Upload failed temporarily. Please try again.",
    );
  }

  if (!response.ok) {
    throw new Error(extractionErrorMessage(payload));
  }

  if (response.status === 202 && "jobId" in payload) {
    patchUploadProgressRecord(record.id, {
      status: payload.status === "queued" ? "queued" : "processing",
      phase: payload.status === "queued" ? "queued" : "reading_pages",
      jobId: payload.jobId,
      fileHash: payload.fileHash,
      totalPages: payload.pageCount ?? record.totalPages,
      progressPagesProcessed: 0,
      error: undefined,
    });
    return await pollExtractionJob(payload.jobId, { uploadProgressId: record.id });
  }

  return payload as ExtractionApiResponse;
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
