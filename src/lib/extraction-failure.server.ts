export type ExtractionFailureReason =
  | "cache_hit"
  | "quota_exceeded"
  | "pdf_text_probe_failed"
  | "no_selectable_text"
  | "selectable_text_found_but_no_questions"
  | "chunk_extraction_failed"
  | "chunk_only_mode_unsupported"
  | "model_invalid_json"
  | "model_invalid_schema"
  | "model_empty_mcqs"
  | "model_timeout"
  | "openrouter_error"
  | "rate_limited"
  | "file_too_large"
  | "unsupported_file_type"
  | "suspicious_extraction_cost"
  | "worker_timeout"
  | "unknown_transient_error"
  | "server_config_error";

export type ExtractionErrorPayload = {
  error: string;
  hint?: string;
  failureReason: ExtractionFailureReason;
};

const FAILURE_MESSAGES: Record<
  ExtractionFailureReason,
  { error: string; hint?: string }
> = {
  cache_hit: { error: "Cached extraction hit." },
  quota_exceeded: { error: "Usage quota exceeded." },
  pdf_text_probe_failed: {
    error: "Extraction failed temporarily. Please try again.",
    hint: "We could not read this PDF right now. Retrying usually fixes this.",
  },
  no_selectable_text: {
    error: "Could not find selectable text in this PDF. Use a searchable PDF.",
    hint: "Export a searchable PDF with numbered multiple-choice questions.",
  },
  selectable_text_found_but_no_questions: {
    error:
      "We found text, but could not detect numbered multiple-choice questions.",
    hint: "Use a searchable PDF with clearly numbered MCQ blocks (e.g. 1. … A) …).",
  },
  chunk_extraction_failed: {
    error: "Extraction failed temporarily. Please try again.",
    hint: "PDF layout parsing failed on the first attempt. Retrying usually fixes this.",
  },
  chunk_only_mode_unsupported: {
    error: "Fast extraction only supports searchable PDFs. Full-file extraction is disabled.",
    hint: "Upload a searchable PDF instead of images or Word files for fast extraction.",
  },
  model_invalid_json: {
    error:
      "We could read the file, but the AI returned an invalid format. Please try again.",
  },
  model_invalid_schema: {
    error:
      "We could read the file, but the AI returned an invalid format. Please try again.",
  },
  model_empty_mcqs: {
    error: "No questions were found in this file.",
    hint: "Try a PDF with visible numbered multiple-choice questions.",
  },
  model_timeout: {
    error: "Extraction timed out. Please try again.",
  },
  openrouter_error: {
    error: "The AI service returned an error. Please try again.",
  },
  rate_limited: {
    error: "Too many extraction requests. Please wait and try again.",
  },
  file_too_large: {
    error: "File is too large. Use a file under 20 MB.",
  },
  unsupported_file_type: {
    error: "Supported files: PDF, images, TXT, Markdown, and RTF.",
  },
  suspicious_extraction_cost: {
    error: "Extraction cost estimate is unusually high for this file.",
    hint: "Try a smaller file or contact support if this file should be allowed.",
  },
  worker_timeout: {
    error: "Extraction took too long and was stopped.",
    hint: "Retry the upload. Large files may need a shorter PDF or a paid plan with higher limits.",
  },
  unknown_transient_error: {
    error: "Extraction failed temporarily. Please try again.",
  },
  server_config_error: {
    error: "Server storage is not configured.",
  },
};

export function buildFailureResponse(
  reason: ExtractionFailureReason,
  overrides?: { error?: string; hint?: string },
): ExtractionErrorPayload {
  const defaults = FAILURE_MESSAGES[reason];
  return {
    failureReason: reason,
    error: overrides?.error ?? defaults.error,
    hint: overrides?.hint ?? defaults.hint,
  };
}

export function isTransientFailureReason(reason: ExtractionFailureReason): boolean {
  return (
    reason === "pdf_text_probe_failed" ||
    reason === "chunk_extraction_failed" ||
    reason === "model_invalid_json" ||
    reason === "model_invalid_schema" ||
    reason === "model_timeout" ||
    reason === "worker_timeout" ||
    reason === "unknown_transient_error" ||
    reason === "openrouter_error"
  );
}

export function isUpstreamFailureReason(reason: ExtractionFailureReason): boolean {
  return (
    reason === "openrouter_error" ||
    reason === "model_invalid_json" ||
    reason === "model_invalid_schema" ||
    reason === "model_timeout" ||
    reason === "pdf_text_probe_failed" ||
    reason === "chunk_extraction_failed" ||
    reason === "worker_timeout" ||
    reason === "unknown_transient_error"
  );
}

export type ExtractionAttemptLog = {
  fileHash: string;
  fileName: string;
  pageCount: number;
  attemptNumber: number;
  sampledTextItemCount?: number;
  sampledTextCharCount?: number;
  sourceChunksCount?: number;
  sourcePreviewsGenerated?: number;
  sourcePreviewFailures?: number;
  extractionFailureReason?: ExtractionFailureReason;
  model?: string;
  batchCount?: number;
  failedBatchIndexes?: number[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  costPerPage?: number;
  costPerQuestion?: number;
  questionCount?: number;
  cached?: boolean;
  inFlightHit?: boolean;
  openRouterCalled?: boolean;
  durationMs?: number;
};

export function logExtractionAttempt(log: ExtractionAttemptLog): void {
  console.info("[pdf-extraction]", JSON.stringify(log));
}

export function classifyZeroChunkPdfFailure(args: {
  probeHasText: boolean;
  retryProbeHasText: boolean;
}): ExtractionFailureReason {
  if (args.probeHasText || args.retryProbeHasText) {
    return "selectable_text_found_but_no_questions";
  }
  return "no_selectable_text";
}
