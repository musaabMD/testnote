import { splitChunksIntoBatches } from "@/lib/chunk-batch.server";
import {
  estimateExtractionCostUsd,
  reserveCostUsd,
} from "@/lib/plan-limits.server";
import {
  preflightTrackedAiCall,
  trackedOpenRouterFetch,
  type TrackedOpenRouterContext,
} from "@/lib/tracked-openrouter.server";
import { recordAppAuditEvent } from "@/lib/audit-events.server";
import { releaseQuotaReservation } from "@/lib/convex-usage-client.server";
import { commitCacheHitUsage } from "@/lib/convex-usage-client.server";
import {
  claimDistributedExtraction,
  getDistributedExtractionJob,
  type DistributedExtractionClaim,
} from "@/lib/distributed-extraction-lock.server";
import {
  upsertExtractionPage,
  upsertExtractionPageAudit,
} from "@/lib/extraction-page-store.server";
import {
  buildExtractionCacheKey,
  extractionCacheKeyId,
  isFullFileMultimodalFallbackEnabled,
  shouldAutoFixGrammar,
  type ExtractionCacheKey,
} from "@/lib/extraction-config";
import { fixGrammarForMcqs } from "@/lib/fix-grammar";
import { normalizeSourceRegion as normalizeHighlightSourceRegion } from "@/lib/highlightable-source";
import type { SourceChunk } from "@/lib/highlightable-source";
import {
  lookupExtractionCache,
  persistExtractionCache,
  type CachedExtractionPayload,
} from "@/lib/extraction-cache.server";
import { sendExtractionJobEmail } from "@/lib/extraction-email.server";
import {
  buildFailureResponse,
  logExtractionAttempt,
  type ExtractionFailureReason,
} from "@/lib/extraction-failure.server";
import {
  createExtractionJob,
  persistPdfExtractionRecord,
  updateExtractionJob,
} from "@/lib/extraction-job-store.server";
import { validateMcqExtractionResponse } from "@/lib/mcq-result-validation.server";
import { coercePdfMcqResult, type PdfMcq, type PdfMcqResult } from "@/lib/pdf-mcqs";
import { extractSourceChunksFromPdf, extractSourcePagePacksFromPdf } from "@/lib/pdfjs-server.server";
import { mapChunkIdsToMcqRegions } from "@/lib/pdf-source-chunks.server";
import type { SourcePagePack } from "@/lib/pdf-source-chunks.server";
import {
  countQuestionCandidateSignals,
  hasQuestionIntent,
  normalizeLineForParsing,
  parseLeadingQuestionNumber,
} from "@/lib/mcq-line-patterns";
import {
  hasSelectableText,
  probePdfSelectableText,
  type PdfTextProbeResult,
} from "@/lib/pdf-text-probe.server";
import {
  extractOpenRouterContent,
  getOpenRouterMaxTokens,
  getOpenRouterModel,
  parseJsonFromModel,
} from "@/lib/openrouter-client";
import type { ExtractionMode } from "@/lib/quiz-settings";
import { formatOptionText, formatQuestionText } from "@/lib/question-text";
import { normalizeImageRegion } from "@/lib/pdf-question-images";
import { attachServerSourcePreviews } from "@/lib/source-preview-store.server";
import { isMistralOcrAvailable, runMistralOcr } from "@/lib/mistral-ocr.server";
import { ocrPagesToSourceChunks } from "@/lib/ocr-chunks";

export type { ExtractionFailureReason } from "@/lib/extraction-failure.server";

export type ExtractionSuccessResponse = PdfMcqResult & {
  fileHash: string;
  fileName: string;
  pageCount: number;
  sourceChunks: SourceChunk[];
  cached?: boolean;
  inFlightHit?: boolean;
  jobId?: string;
};

export type ExtractionErrorResponse = {
  error: string;
  hint?: string;
  failureReason: ExtractionFailureReason;
  jobId?: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> };
  }>;
  error?: { message?: string };
};

type McqExtractionParseError = {
  parsed: null;
  coerced: null;
  rawContent: string;
  parseError: "invalid-json";
};

type McqExtractionSchemaError = {
  parsed: unknown;
  coerced: null;
  rawContent: string;
  parseError: "invalid-schema" | "empty-mcqs";
};

type McqExtractionSuccess = {
  parsed: unknown;
  coerced: PdfMcqResult;
  rawContent: string;
};

type McqExtractionFailure = {
  error: string;
  status: number;
};

type McqFilePayload = {
  filename: string;
  file_data: string;
};

type FileIntelligence = {
  document_summary: {
    file_name: string;
    detected_title_or_exam_name: string | null;
    detected_subject: string | null;
    detected_language: string[];
    document_type: string;
    has_existing_questions: boolean;
    needs_generated_questions: boolean;
    total_pages_received: number;
    estimated_distinct_question_count: number;
    confidence: number;
  };
  page_audit: Array<{
    page_number: number;
    page_role: string;
    has_questions: boolean;
    estimated_question_count: number;
    question_markers_found: string[];
    important_notes: string;
    should_extract_questions: boolean;
    confidence: number;
  }>;
  global_warnings: string[];
};

type ExtractionRunContext = {
  fileHash: string;
  fileName: string;
  pageCount: number;
  clerkUserId: string;
  model: string;
  startedAt: number;
  attemptNumber: number;
  openRouterCalled: boolean;
  probe?: PdfTextProbeResult;
  sourceChunksCount?: number;
  batchCount?: number;
  failedBatchIndexes?: number[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
};

const inFlightExtractions = new Map<
  string,
  Promise<ExtractionSuccessResponse | ExtractionErrorResponse>
>();

function logExtractionCacheKey(args: {
  fileHash: string;
  extractionMode: ExtractionMode;
  extractionModel: string;
  appExtractionVersion: string;
  cacheHit: boolean;
  inFlightHit: boolean;
  openRouterCalled: boolean;
}) {
  console.info("[pdf-extraction-cache-key]", JSON.stringify(args));
}

function getExtractionRepairModel() {
  return getOpenRouterModel("OPENROUTER_EXTRACTION_REPAIR_MODEL", "google/gemini-2.5-flash");
}

function dynamicExtractionMaxTokens(args: {
  configuredMaxTokens: number;
  pageCount: number;
  estimatedQuestionCount?: number;
}) {
  // pageCount=1 can arrive from a client-side PDF.js worker failure. If the probe
  // has already corrected it this will be a real page count. Either way, clamp the
  // lower end of the estimate so a bad pageCount never silences the model output.
  const safePageCount = Math.max(args.pageCount, 4); // treat every file as at least 4 pages
  const estimatedQuestionCount =
    args.estimatedQuestionCount ?? Math.max(8, Math.min(60, safePageCount * 4));
  // 500 tokens per question + 3000 overhead; never less than 10000 so even a small
  // file gets enough budget and a wrong pageCount can't cause questions to be dropped.
  return Math.min(args.configuredMaxTokens, Math.max(10000, estimatedQuestionCount * 500 + 3000));
}

function warnOnSuspiciousExtractionCost(args: {
  fileHash: string;
  fileName: string;
  pageCount: number;
  model: string;
  estimatedCostUsd: number;
}) {
  if (args.pageCount > 5 || args.estimatedCostUsd <= 0.01) return;
  console.warn(
    "[pdf-extraction-cost-guard]",
    JSON.stringify({
      ...args,
      action: "warn_only",
      reason: "small_file_estimated_cost_exceeds_threshold",
    }),
  );
}

function getSuspiciousExtractionCostBlock(args: {
  pageCount: number;
  estimatedCostUsd: number;
}): { error: string; hint: string } | null {
  const maxSmallFileCost = getEnvNumber(
    "EXTRACTION_SUSPICIOUS_SMALL_FILE_MAX_USD",
    0.08,
  );
  const maxCostPerPage = getEnvNumber("EXTRACTION_SUSPICIOUS_MAX_USD_PER_PAGE", 0.035);
  const costPerPage = costRatio(args.estimatedCostUsd, args.pageCount);

  if (args.pageCount <= 5 && args.estimatedCostUsd > maxSmallFileCost) {
    return {
      error: "Extraction cost estimate is unusually high for this small file.",
      hint: `Estimated cost $${args.estimatedCostUsd.toFixed(4)} exceeds the small-file guardrail of $${maxSmallFileCost.toFixed(2)}.`,
    };
  }

  if (costPerPage > maxCostPerPage) {
    return {
      error: "Extraction cost estimate is unusually high per page.",
      hint: `Estimated cost per page $${costPerPage.toFixed(4)} exceeds the guardrail of $${maxCostPerPage.toFixed(2)}.`,
    };
  }

  return null;
}

function logDevModelCostComparison(args: {
  fileHash: string;
  fileName: string;
  pageCount: number;
  batchCount: number;
  model: string;
}) {
  if (process.env.NODE_ENV !== "development") return;
  const actualEstimate = estimateExtractionCostUsd({
    pageCount: args.pageCount,
    batchCount: args.batchCount,
    model: args.model,
  });
  const flashLiteEstimate = estimateExtractionCostUsd({
    pageCount: args.pageCount,
    batchCount: args.batchCount,
    model: "google/gemini-2.5-flash-lite",
  });
  const savingsPercent =
    actualEstimate > 0
      ? Math.max(0, ((actualEstimate - flashLiteEstimate) / actualEstimate) * 100)
      : 0;
  console.info(
    "[pdf-extraction-model-cost-comparison]",
    JSON.stringify({
      fileHash: args.fileHash,
      fileName: args.fileName,
      pageCount: args.pageCount,
      batchCount: args.batchCount,
      actualModel: args.model,
      actualEstimateUsd: actualEstimate,
      flashLiteEstimateUsd: flashLiteEstimate,
      savingsPercent,
    }),
  );
}

function costRatio(costUsd: number, divisor: number): number {
  return divisor > 0 ? costUsd / divisor : 0;
}

function extractionCostFields(ctx: ExtractionRunContext, questionCount = 0) {
  return {
    promptTokens: ctx.usage.promptTokens,
    completionTokens: ctx.usage.completionTokens,
    totalTokens: ctx.usage.totalTokens,
    costUsd: ctx.usage.costUsd,
    costPerPage: costRatio(ctx.usage.costUsd, ctx.pageCount),
    costPerQuestion: costRatio(ctx.usage.costUsd, questionCount),
    questionCount,
  };
}

function jitteredDelay(minMs: number, maxMs: number): Promise<void> {
  const delayMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function failExtraction(args: {
  jobId: string;
  reason: ExtractionFailureReason;
  ctx: ExtractionRunContext;
  overrides?: { error?: string; hint?: string };
}): Promise<ExtractionErrorResponse> {
  const payload = buildFailureResponse(args.reason, args.overrides);

  await updateExtractionJob(args.jobId, {
    status: "failed",
    failureReason: args.reason,
    error: payload.error,
  });
  void sendExtractionJobEmail({
    clerkUserId: args.ctx.clerkUserId,
    fileName: args.ctx.fileName,
    status: "failed",
    error: payload.error,
  });

  logExtractionAttempt({
    fileHash: args.ctx.fileHash,
    fileName: args.ctx.fileName,
    pageCount: args.ctx.pageCount,
    attemptNumber: args.ctx.attemptNumber,
    sampledTextItemCount: args.ctx.probe?.sampledTextItemCount,
    sampledTextCharCount: args.ctx.probe?.sampledTextCharCount,
    sourceChunksCount: args.ctx.sourceChunksCount,
    ...extractionCostFields(args.ctx),
    extractionFailureReason: args.reason,
    model: args.ctx.model,
    batchCount: args.ctx.batchCount,
    failedBatchIndexes: args.ctx.failedBatchIndexes,
    openRouterCalled: args.ctx.openRouterCalled,
    durationMs: Date.now() - args.ctx.startedAt,
  });

  return { ...payload, jobId: args.jobId };
}

async function extractPdfChunksWithRetry(args: {
  arrayBuffer: ArrayBuffer;
  fileHash: string;
  probe: PdfTextProbeResult;
}): Promise<SourceChunk[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const chunks = await extractSourceChunksFromPdf(args.arrayBuffer, args.fileHash);
      if (chunks.length > 0) {
        return chunks;
      }

      if (hasSelectableText(args.probe) && attempt < 2) {
        await jitteredDelay(300, 700);
        continue;
      }
      return [];
    } catch (error) {
      lastError = error;
      if (process.env.NODE_ENV === "development") {
        console.warn("[pdf-extraction] chunk extraction attempt failed:", error);
      }
      if (attempt < 2) {
        await jitteredDelay(300, 700);
        continue;
      }
    }
  }

  if (lastError && process.env.NODE_ENV === "development") {
    console.warn("[pdf-extraction] chunk extraction exhausted retries:", lastError);
  }

  return [];
}

async function extractPdfPagePacksWithRetry(args: {
  arrayBuffer: ArrayBuffer;
  fileHash: string;
  probe: PdfTextProbeResult;
}): Promise<SourcePagePack[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const pages = await extractSourcePagePacksFromPdf(args.arrayBuffer, args.fileHash);
      if (pages.some((page) => page.pageText.trim() || page.blocks.length > 0)) {
        return pages;
      }

      if (hasSelectableText(args.probe) && attempt < 2) {
        await jitteredDelay(300, 700);
        continue;
      }
      return pages;
    } catch (error) {
      lastError = error;
      if (process.env.NODE_ENV === "development") {
        console.warn("[pdf-extraction] page-pack extraction attempt failed:", error);
      }
      if (attempt < 2) {
        await jitteredDelay(300, 700);
        continue;
      }
    }
  }

  if (lastError && process.env.NODE_ENV === "development") {
    console.warn("[pdf-extraction] page-pack extraction exhausted retries:", lastError);
  }

  return [];
}

export async function runPdfMcqExtraction(args: {
  apiKey: string;
  fileName: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
  fileSizeBytes?: number;
  extractionMode: ExtractionMode;
  fileHash: string;
  pageCount: number;
  clerkUserId: string;
  email?: string | null;
  jobId?: string;
}): Promise<ExtractionSuccessResponse | ExtractionErrorResponse> {
  const model = getOpenRouterModel("OPENROUTER_EXTRACTION_MODEL");
  const cacheKey = buildExtractionCacheKey(args.fileHash, args.extractionMode, model);
  const extractionKey = extractionCacheKeyId(cacheKey);
  const existing = inFlightExtractions.get(extractionKey);
  if (existing) {
    const result = await existing;
    logExtractionCacheKey({
      ...cacheKey,
      cacheHit: Boolean("mcqs" in result && result.cached),
      inFlightHit: true,
      openRouterCalled: false,
    });
    return "mcqs" in result ? { ...result, inFlightHit: true } : result;
  }

  const promise = runPdfMcqExtractionCore(args).finally(() => {
    inFlightExtractions.delete(extractionKey);
  });
  inFlightExtractions.set(extractionKey, promise);
  return promise;
}

async function runPdfMcqExtractionCore(args: {
  apiKey: string;
  fileName: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
  fileSizeBytes?: number;
  extractionMode: ExtractionMode;
  fileHash: string;
  pageCount: number;
  clerkUserId: string;
  email?: string | null;
  jobId?: string;
}): Promise<ExtractionSuccessResponse | ExtractionErrorResponse> {
  const {
    apiKey,
    fileName,
    mimeType,
    arrayBuffer,
    extractionMode,
    fileHash,
    clerkUserId,
  } = args;
  // pageCount may be wrong (client PDF.js worker failure returns 1).
  // We re-assign it after the server-side probe corrects it.
  let pageCount = args.pageCount;
  const model = getOpenRouterModel("OPENROUTER_EXTRACTION_MODEL");
  const configuredMaxTokens = getOpenRouterMaxTokens("OPENROUTER_EXTRACTION_MAX_TOKENS", 16000);
  const repairModel = getExtractionRepairModel();
  const cacheKey = buildExtractionCacheKey(fileHash, extractionMode, model);
  const extractionKey = extractionCacheKeyId(cacheKey);
  const startedAt = Date.now();

  const runCtx: ExtractionRunContext = {
    fileHash,
    fileName,
    pageCount,
    clerkUserId,
    model,
    startedAt,
    attemptNumber: 1,
    openRouterCalled: false,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    },
  };

  const cached = await lookupExtractionCache(cacheKey);
  if (cached) {
    return returnCachedExtraction({
      cached,
      cacheKey,
      fileHash,
      fileName,
      pageCount,
      clerkUserId,
      model,
      startedAt,
      runCtx,
      inFlightHit: false,
      jobId: args.jobId,
    });
  }

  const distributedClaim = await claimDistributedExtraction({
    extractionKey,
    fileHash,
    fileName,
    mimeType,
    extractionMode,
    extractionModel: model,
    clerkUserId,
    totalPages: pageCount,
    jobId: args.jobId,
  });
  if (!distributedClaim.owner) {
    void recordAppAuditEvent({
      userId: clerkUserId,
      eventType: "duplicate_extraction_waiter",
      feature: "extract",
      fileHash,
      jobId: distributedClaim.jobId,
      reason: "existing_extraction_job_processing",
      metadata: {
        extractionKey,
        enabled: distributedClaim.enabled,
      },
    });
    return waitForDistributedExtraction({
      claim: distributedClaim,
      cacheKey,
      fileHash,
      fileName,
      pageCount,
      clerkUserId,
      model,
      startedAt,
      runCtx,
    });
  }
  void recordAppAuditEvent({
    userId: clerkUserId,
    eventType: "duplicate_extraction_owner",
    feature: "extract",
    fileHash,
    jobId: distributedClaim.jobId,
    reason: "claimed_extraction_job_owner",
    metadata: {
      extractionKey,
      enabled: distributedClaim.enabled,
    },
  });

  const job = await createExtractionJob({
    jobId: distributedClaim.jobId,
    extractionKey: distributedClaim.enabled ? extractionKey : undefined,
    ownerId: distributedClaim.ownerId,
    fileHash,
    fileName,
    mimeType,
    extractionMode,
    extractionModel: model,
    totalPages: pageCount,
    clerkUserId,
  });
  await updateExtractionJob(job.id, { status: "processing" });

  const trackingBase: Omit<TrackedOpenRouterContext, "reservationId"> = {
    clerkUserId,
    email: args.email,
    feature: "extract",
    jobId: job.id,
    fileHash,
    pagesProcessed: pageCount,
    usageAccumulator: runCtx.usage,
  };

  const isPdf =
    mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

  let sourceChunks: SourceChunk[] = [];
  let sourcePagePacks: SourcePagePack[] = [];

  if (isPdf) {
    let probe = await probePdfSelectableText(arrayBuffer);
    runCtx.probe = probe;

    if (!probe.pdfOpened) {
      runCtx.attemptNumber = 2;
      await jitteredDelay(300, 700);
      probe = await probePdfSelectableText(arrayBuffer);
      runCtx.probe = probe;
    }

    if (!probe.pdfOpened && process.env.NODE_ENV === "development" && probe.probeError) {
      console.warn("[pdf-extraction] PDF probe failed; falling back to full-file extraction:", probe.probeError);
    }

    // Fix: correct a wrong client-provided pageCount using the server-side probe.
    // The browser PDF.js worker (/pdf.worker.mjs) frequently fails to load, causing
    // the client to fall back to pageCount=1. The server probe uses the Node.js
    // legacy pdfjs worker and is the authoritative source of truth.
    if (probe.pdfOpened && probe.pageCount > pageCount) {
      console.info("[pdf-extraction] correcting pageCount from client-provided value", {
        clientPageCount: pageCount,
        serverPageCount: probe.pageCount,
        fileHash,
      });
      pageCount = probe.pageCount;
      runCtx.pageCount = probe.pageCount;
    }

    sourcePagePacks = await extractPdfPagePacksWithRetry({
      arrayBuffer,
      fileHash,
      probe,
    });

    sourceChunks = sourcePagePacks.flatMap((page) => page.blocks);

    if (!sourceChunks.length) {
      sourceChunks = await extractPdfChunksWithRetry({
        arrayBuffer,
        fileHash,
        probe,
      });
      sourcePagePacks = sourceChunksToPagePacks(sourceChunks, fileHash, pageCount);
    }

    // If the PDF has no selectable text (e.g. scanned / image-based), use
    // Mistral OCR to extract per-page markdown before falling back to the
    // full-file multimodal path.  OCR results are cached on disk in dev so
    // subsequent runs are instant and free.
    if (sourceChunks.length === 0 && isMistralOcrAvailable()) {
      const ocrResult = await runMistralOcr(arrayBuffer, fileHash, fileName);
      if (ocrResult && ocrResult.pages.length > 0) {
        sourceChunks = ocrPagesToSourceChunks(ocrResult.pages, fileHash);
        sourcePagePacks = sourceChunksToPagePacks(sourceChunks, fileHash, pageCount);
        // OCR page count is authoritative for scanned documents
        if (ocrResult.pages.length > pageCount) {
          pageCount = ocrResult.pages.length;
          runCtx.pageCount = ocrResult.pages.length;
        }
        console.info("[pdf-extraction] using Mistral OCR chunks", {
          fileHash,
          ocrPageCount: ocrResult.pages.length,
          chunkCount: sourceChunks.length,
        });
      }
    }

    runCtx.sourceChunksCount = sourceChunks.length;
    await recordPageScanProgress({
      jobId: job.id,
      fileHash,
      clerkUserId,
      pageCount,
      sourceChunks,
    });
  }

  const batchCount = sourceChunks.length
    ? splitChunksIntoBatches(sourceChunks).length
    : 1;
  runCtx.batchCount = batchCount;

  const estimatedCost = reserveCostUsd(
    estimateExtractionCostUsd({ pageCount, batchCount, model }),
  );
  logDevModelCostComparison({
    fileHash,
    fileName,
    pageCount,
    batchCount,
    model,
  });
  warnOnSuspiciousExtractionCost({
    fileHash,
    fileName,
    pageCount,
    model,
    estimatedCostUsd: estimatedCost,
  });
  const suspiciousCostBlock = getSuspiciousExtractionCostBlock({
    pageCount,
    estimatedCostUsd: estimatedCost,
  });
  if (suspiciousCostBlock) {
    void recordAppAuditEvent({
      userId: clerkUserId,
      eventType: "openrouter_call_blocked",
      feature: "extract",
      fileHash,
      jobId: job.id,
      reason: "suspicious_extraction_cost",
      metadata: {
        estimatedCostUsd: estimatedCost,
        pageCount,
        batchCount,
        model,
      },
    });
    return failExtraction({
      jobId: job.id,
      reason: "suspicious_extraction_cost",
      ctx: runCtx,
      overrides: suspiciousCostBlock,
    });
  }

  const preflight = await preflightTrackedAiCall({
    clerkUserId,
    email: args.email,
    feature: "extract",
    estimatedCostUsd: estimatedCost,
    estimatedPages: pageCount,
    fileSizeBytes: args.fileSizeBytes,
    jobId: job.id,
    fileHash,
    model,
  });

  if (!preflight.allowed) {
    const reason = preflight.reason ?? "Usage quota exceeded.";
    return failExtraction({
      jobId: job.id,
      reason: "quota_exceeded",
      ctx: runCtx,
      overrides: { error: reason },
    });
  }

  const trackingCtx: TrackedOpenRouterContext = {
    ...trackingBase,
    reservationId: preflight.reservationId,
  };

  if (sourceChunks.length > 0) {
    runCtx.openRouterCalled = true;
    const intelligence = sourcePagePacks.length
      ? await runFileIntelligence({
          apiKey,
          model,
          fileName,
          pagePacks: sourcePagePacks,
          trackingCtx,
        })
      : buildFallbackFileIntelligence(fileName, pageCount, sourceChunks);
    await recordFileIntelligenceProgress({
      jobId: job.id,
      fileHash,
      clerkUserId,
      pageCount,
      sourceChunks,
      intelligence,
    });
    const extractionChunks = selectChunksForIntelligence(sourceChunks, intelligence);
    const selectedExtractionChunks = extractionChunks.length ? extractionChunks : sourceChunks;
    const contextChunks = buildPageContextChunks(sourceChunks);
    const selectedContextChunks = selectChunksForIntelligence(contextChunks, intelligence);
    const sourceChunksForSources = contextChunks.length
      ? [...sourceChunks, ...contextChunks]
      : sourceChunks;
    const chunkExtraction = await runPageLevelExtraction({
      apiKey,
      model,
      maxTokens: dynamicExtractionMaxTokens({
        configuredMaxTokens,
        pageCount,
        estimatedQuestionCount: Math.max(
          intelligence.document_summary.estimated_distinct_question_count,
          selectedExtractionChunks.length,
        ),
      }),
      repairModel,
      extractionMode,
      sourceChunks: selectedExtractionChunks,
      jobId: job.id,
      trackingCtx,
      runCtx,
    });

    if (!("failureReason" in chunkExtraction) && chunkExtraction.mcqs.length > 0) {
      mapChunkIdsToMcqRegions(chunkExtraction.mcqs, sourceChunksForSources);

      let normalized = normalizeResult(chunkExtraction);
      normalized = await runSupplementalWindowExtractionIfShort({
        apiKey,
        model,
        repairModel,
        maxTokens: dynamicExtractionMaxTokens({
          configuredMaxTokens,
          pageCount,
          estimatedQuestionCount: intelligence.document_summary.estimated_distinct_question_count,
        }),
        extractionMode,
        intelligence,
        sourceChunks: selectedContextChunks.length ? selectedContextChunks : contextChunks,
        allSourceChunks: sourceChunksForSources,
        current: normalized,
        jobId: job.id,
        trackingCtx,
        runCtx,
      });
      normalized = await repairPagesBelowIntelligence({
        apiKey,
        model,
        repairModel,
        maxTokens: dynamicExtractionMaxTokens({
          configuredMaxTokens,
          pageCount,
          estimatedQuestionCount: intelligence.document_summary.estimated_distinct_question_count,
        }),
        intelligence,
        sourceChunks: sourceChunksForSources,
        current: normalized,
        trackingCtx,
      });
      mapChunkIdsToMcqRegions(normalized.mcqs, sourceChunksForSources);
      await recordPageExtractionAudits({
        jobId: job.id,
        fileHash,
        pageCount,
        sourceChunks: sourceChunksForSources,
        result: normalized,
        intelligence,
        retryCount: runCtx.failedBatchIndexes?.length ?? 0,
      });
      const finalized = await finalizeExtraction({
        apiKey,
        cacheKey,
        fileHash,
        fileName,
        extractionMode,
        clerkUserId,
        pageCount,
        normalized,
        sourceChunks: sourceChunksForSources,
        jobId: job.id,
        reservationId: trackingCtx.reservationId,
        runCtx,
      });

      return { ...finalized, jobId: job.id };
    }

    if (process.env.NODE_ENV === "development") {
      console.warn("[pdf-extraction] Chunk extraction returned no questions; falling back to full-file extraction.");
    }
  }

  if (!isFullFileMultimodalFallbackEnabled()) {
    return failExtraction({
      jobId: job.id,
      reason: "chunk_only_mode_unsupported",
      ctx: runCtx,
    });
  }

  runCtx.openRouterCalled = true;
  // In full-file mode the ENTIRE document is sent in one shot — use the maximum
  // configured token budget so long documents are not silently truncated.
  // (dynamicExtractionMaxTokens would cap this too low for multi-page PDFs that
  // arrived with a wrong pageCount=1 from the client.)
  const fullFileResult = await runFullFileExtraction({
    apiKey,
    model,
    maxTokens: configuredMaxTokens,
    repairModel,
    extractionMode,
    fileName,
    mimeType,
    arrayBuffer,
    jobId: job.id,
    trackingCtx,
    runCtx,
  });

  if ("failureReason" in fullFileResult) return fullFileResult;

  await recordPageExtractionAudits({
    jobId: job.id,
    fileHash,
    pageCount,
    sourceChunks: fullFileResult.sourceChunks,
    result: fullFileResult,
    retryCount: runCtx.failedBatchIndexes?.length ?? 0,
  });

  const finalized = await finalizeExtraction({
    apiKey,
    cacheKey,
    fileHash,
    fileName,
    extractionMode,
    clerkUserId,
    pageCount,
    normalized: fullFileResult,
    sourceChunks: fullFileResult.sourceChunks,
    jobId: job.id,
    reservationId: trackingCtx.reservationId,
    runCtx,
  });

  return { ...finalized, jobId: job.id };
}

async function recordPageScanProgress(args: {
  jobId: string;
  fileHash: string;
  clerkUserId: string;
  pageCount: number;
  sourceChunks: SourceChunk[];
}) {
  const chunksByPage = groupChunksByPage(args.sourceChunks);

  for (let pageIndex = 0; pageIndex < args.pageCount; pageIndex += 1) {
    const pageNumber = pageIndex + 1;
    const chunks = chunksByPage.get(pageNumber) ?? [];
    const candidateQuestionCount = chunks.filter((chunk) =>
      chunkLooksLikeQuestion(chunk.text),
    ).length;

    await upsertExtractionPage({
      jobId: args.jobId,
      fileHash: args.fileHash,
      clerkUserId: args.clerkUserId,
      pageIndex,
      text: chunks.map((chunk) => chunk.text).join("\n\n").slice(0, 80_000),
      mode: candidateQuestionCount > 0 ? "existing_questions" : "noise",
      candidateQuestionCount,
      status: candidateQuestionCount > 0 ? "processing" : "done",
    });
  }
}

function sourceChunksToPagePacks(
  sourceChunks: SourceChunk[],
  documentId: string,
  pageCount: number,
): SourcePagePack[] {
  const chunksByPage = groupChunksByPage(sourceChunks);
  const pages: SourcePagePack[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const blocks = chunksByPage.get(pageNumber) ?? [];
    pages.push({
      documentId,
      pageNumber,
      pageText: blocks.map((chunk) => chunk.text).join("\n\n").trim(),
      blocks,
    });
  }

  return pages;
}

function selectChunksForIntelligence(
  sourceChunks: SourceChunk[],
  intelligence: FileIntelligence,
): SourceChunk[] {
  const pagesToExtract = new Set(
    intelligence.page_audit
      .filter(
        (page) =>
          page.should_extract_questions ||
          page.has_questions ||
          page.estimated_question_count > 0,
      )
      .map((page) => page.page_number),
  );

  if (!pagesToExtract.size && intelligence.document_summary.has_existing_questions) {
    return sourceChunks;
  }

  return sourceChunks.filter((chunk) => pagesToExtract.has(chunk.pageNumber));
}

function buildPageContextChunks(sourceChunks: SourceChunk[]): SourceChunk[] {
  const windows: SourceChunk[] = [];
  const chunksByPage = groupChunksByPage(sourceChunks);

  for (const [pageNumber, pageChunks] of chunksByPage.entries()) {
    const sorted = [...pageChunks].sort((a, b) => {
      const yDiff = (a.region?.y ?? 0) - (b.region?.y ?? 0);
      if (Math.abs(yDiff) > 0.005) return yDiff;
      return (a.region?.x ?? 0) - (b.region?.x ?? 0);
    });
    if (sorted.length < 4) continue;

    const windowSize = sorted.length <= 12 ? sorted.length : 12;
    const step = sorted.length <= 12 ? windowSize : 6;
    let windowIndex = 0;

    for (let start = 0; start < sorted.length; start += step) {
      const slice = sorted.slice(start, Math.min(sorted.length, start + windowSize));
      if (slice.length < 3) continue;
      const text = slice.map((chunk) => chunk.text).join("\n").trim();
      if (text.length < 40) continue;

      windowIndex += 1;
      windows.push({
        id: `p${pageNumber}_ctx${windowIndex}`,
        fileId: slice[0]?.fileId,
        pageNumber,
        text,
        region: unionChunkRegions(pageNumber, slice),
      });

      if (start + windowSize >= sorted.length) break;
    }
  }

  return windows;
}

function unionChunkRegions(
  pageNumber: number,
  chunks: SourceChunk[],
): SourceChunk["region"] {
  const regions = chunks.map((chunk) => chunk.region).filter(Boolean);
  if (!regions.length) {
    return {
      pageNumber,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      sourceKind: "page",
      method: "pdf-layout",
      confidence: 0.4,
    };
  }

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let confidence = 1;

  for (const region of regions) {
    minX = Math.min(minX, region.x);
    minY = Math.min(minY, region.y);
    maxX = Math.max(maxX, region.x + region.width);
    maxY = Math.max(maxY, region.y + region.height);
    confidence = Math.min(confidence, region.confidence ?? 0.82);
  }

  return {
    pageNumber,
    x: clamp01(minX),
    y: clamp01(minY),
    width: Math.min(clamp01(maxX - minX), 1 - clamp01(minX)),
    height: Math.min(clamp01(maxY - minY), 1 - clamp01(minY)),
    sourceKind: "question-block",
    method: "pdf-layout",
    confidence,
  };
}

async function runFileIntelligence(args: {
  apiKey: string;
  model: string;
  fileName: string;
  pagePacks: SourcePagePack[];
  trackingCtx: TrackedOpenRouterContext;
}): Promise<FileIntelligence> {
  const body = JSON.stringify({
    model: args.model,
    temperature: 0,
    top_p: 0.1,
    max_tokens: Math.min(8000, Math.max(2500, args.pagePacks.length * 450 + 1800)),
    response_format: { type: "json_object" },
    plugins: [{ id: "response-healing" }],
    messages: [
      { role: "system", content: buildFileIntelligenceSystemPrompt() },
      {
        role: "user",
        content: `Analyze this uploaded file for DrNote.

Input pages:
${JSON.stringify({
  document_id: args.pagePacks[0]?.documentId ?? "current_upload",
  file_name: args.fileName,
  pages: pagePacksToModelInput(args.pagePacks),
})}

Return JSON only.`,
      },
    ],
  });

  const { response, data: rawData } = await trackedOpenRouterFetch(
    args.trackingCtx,
    args.model,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000/pdf",
        "X-Title": "TestNote PDF File Intelligence",
      },
      body,
    },
  );

  if (!response.ok) {
    const data = rawData as OpenRouterResponse | null;
    console.warn(
      "[pdf-file-intelligence] OpenRouter request failed:",
      data?.error?.message ?? response.status,
    );
    return buildFallbackFileIntelligence(
      args.fileName,
      args.pagePacks.length,
      args.pagePacks.flatMap((page) => page.blocks),
    );
  }

  try {
    const data = rawData as OpenRouterResponse | null;
    const rawContent = extractOpenRouterContent(data?.choices?.[0]?.message?.content);
    const parsed = parseJsonFromModel(rawContent);
    return coerceFileIntelligence(
      parsed,
      args.fileName,
      args.pagePacks.length,
      args.pagePacks.flatMap((page) => page.blocks),
    );
  } catch (error) {
    console.warn("[pdf-file-intelligence] Failed to parse intelligence response:", error);
    return buildFallbackFileIntelligence(
      args.fileName,
      args.pagePacks.length,
      args.pagePacks.flatMap((page) => page.blocks),
    );
  }
}

function pagePacksToModelInput(pagePacks: SourcePagePack[]) {
  return pagePacks.map((page) => ({
    page_number: page.pageNumber,
    page_text: page.pageText,
    blocks: page.blocks.map((block) => ({
      block_id: block.id,
      text: block.text,
      bbox: block.region
        ? [block.region.x, block.region.y, block.region.width, block.region.height]
        : undefined,
    })),
  }));
}

function buildFileIntelligenceSystemPrompt() {
  return `You are DrNote File Intelligence Engine.

Your job is to understand uploaded study files.

You will receive parsed PDF/OCR pages. Analyze the document like a careful human reader.

Goals:
1. Identify what kind of file this is.
2. Detect whether it already contains questions.
3. Estimate the number of distinct questions.
4. Identify the likely exam/course/topic name if present.
5. Summarize what each page contains.
6. Mark which pages should be sent to question extraction.
7. Do not miss questions because of formatting.

Important rules:
- Read the FULL page text of EVERY page before estimating. Do not stop early.
- FIRST scan every page for the highest question number you can find (e.g. "12." or "Q12"), then use that as your minimum estimate for the whole file.
- First count questions from the whole file as a human examiner would, then classify pages.
- Treat the estimated count as an audit target for extraction, not as a guess copied from later extraction.
- Count real study/exam questions, including clinical vignettes, MCQs, recall questions, and prompts followed by options.
- A question may begin with a number, a patient scenario, "Which of the following," "What is the most appropriate," "Most likely diagnosis," or may be followed by A/B/C/D options.
- If you see question numbers running from 1 to N (e.g. "1.", "2.", ..., "12."), estimate N questions even if some are partially visible or formatted strangely.
- Mark every page that contains ANY numbered question as should_extract_questions=true. Do not skip a page because only part of a question is on it.
- Do not count page numbers, headings, Telegram links, watermarks, explanations, score notes, or random numbered lists.
- If the same question appears twice, count it once.
- If text is messy, estimate but lower confidence.
- Never invent a question count with high confidence when the page is unclear.

EXAM RECALL DOCUMENT RULES (apply when the document looks like student notes or a recall file):
- A recall document has bullet points (•), dashes (-), and informal prose mixed together — every bullet is a question candidate.
- Do NOT count only numbered items. In recall docs, most questions have no number.
- A short colored/underlined phrase immediately after a question is the ANSWER, not a new question. Do not count it as a question.
- Section headers like "Non-Communicable Diseases", "Communicable Diseases", "Clinical Preventive Services", "Maternal and Child Health", "Environmental and Occupational", "Epidemiology Biostatistics Demography" are NOT questions — they are subject area dividers.
- Explanation paragraphs (long text after an answer, often citing CDC/WHO/USPSTF URLs) are NOT questions.
- "Multiple questions about X" or "3 questions about Y" in the text = count those as stated (minimum 3 if "multiple").
- Arabic text mixed with English is part of the question — do not skip it.
- A recall document covering a full board exam (40–55 pages) typically contains 120–200 questions. A count below 80 is almost certainly wrong.
- Detect recall documents by: mixed bullet/prose/numbered formatting, phrases like "I don't remember the choices", "answer:", "I think", "(mostly this is the answer)", memory hedges from the author.
- When detected as exam_recall, set document_type to "exam_recall" in the output.

Return valid JSON only. No markdown. No explanation outside JSON.

Return this exact structure:
{"document_summary":{"file_name":"","detected_title_or_exam_name":null,"detected_subject":null,"detected_language":[],"document_type":"unknown","has_existing_questions":false,"needs_generated_questions":false,"total_pages_received":0,"estimated_distinct_question_count":0,"confidence":0},"page_audit":[{"page_number":1,"page_role":"unknown","has_questions":false,"estimated_question_count":0,"question_markers_found":[],"important_notes":"","should_extract_questions":false,"confidence":0}],"global_warnings":[]}`;
}

function coerceFileIntelligence(
  value: unknown,
  fileName: string,
  pageCount: number,
  sourceChunks: SourceChunk[],
): FileIntelligence {
  const fallback = buildFallbackFileIntelligence(fileName, pageCount, sourceChunks);
  const root = isPlainObject(value) ? value : {};
  const summary = isPlainObject(root.document_summary) ? root.document_summary : {};
  const rawAudit = Array.isArray(root.page_audit) ? root.page_audit : [];
  const fallbackByPage = new Map(
    fallback.page_audit.map((page) => [page.page_number, page]),
  );

  const pageAudit = Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const raw = rawAudit.find(
      (entry) =>
        isPlainObject(entry) &&
        Math.round(asFiniteNumber(entry.page_number, pageNumber)) === pageNumber,
    );
    const fallbackPage = fallbackByPage.get(pageNumber)!;
    if (!isPlainObject(raw)) return fallbackPage;

    const estimated = Math.max(
      0,
      Math.round(asFiniteNumber(raw.estimated_question_count, fallbackPage.estimated_question_count)),
    );
    const hasQuestions = Boolean(raw.has_questions ?? estimated > 0);

    return {
      page_number: pageNumber,
      page_role: asTrimmedString(raw.page_role) || fallbackPage.page_role,
      has_questions: hasQuestions,
      estimated_question_count: estimated,
      question_markers_found: asStringList(raw.question_markers_found),
      important_notes: asTrimmedString(raw.important_notes),
      should_extract_questions: Boolean(
        raw.should_extract_questions ?? hasQuestions ?? estimated > 0,
      ),
      confidence: clamp01(
        asFiniteNumber(raw.confidence, fallbackPage.confidence),
      ),
    };
  });

  const estimatedTotal = pageAudit.reduce(
    (total, page) => total + page.estimated_question_count,
    0,
  );

  return {
    document_summary: {
      file_name: asTrimmedString(summary.file_name) || fileName,
      detected_title_or_exam_name:
        nullableTrimmedString(summary.detected_title_or_exam_name),
      detected_subject: nullableTrimmedString(summary.detected_subject),
      detected_language: asStringList(summary.detected_language),
      document_type: asTrimmedString(summary.document_type) || "unknown",
      has_existing_questions: Boolean(
        summary.has_existing_questions ?? pageAudit.some((page) => page.has_questions),
      ),
      needs_generated_questions: Boolean(summary.needs_generated_questions ?? estimatedTotal === 0),
      total_pages_received: Math.max(
        pageCount,
        Math.round(asFiniteNumber(summary.total_pages_received, pageCount)),
      ),
      estimated_distinct_question_count: Math.max(
        estimatedTotal,
        Math.round(
          asFiniteNumber(summary.estimated_distinct_question_count, estimatedTotal),
        ),
      ),
      confidence: clamp01(asFiniteNumber(summary.confidence, fallback.document_summary.confidence)),
    },
    page_audit: pageAudit,
    global_warnings: asStringList(root.global_warnings),
  };
}

function buildFallbackFileIntelligence(
  fileName: string,
  pageCount: number,
  sourceChunks: SourceChunk[],
): FileIntelligence {
  const chunksByPage = groupChunksByPage(sourceChunks);
  const page_audit = Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const chunks = chunksByPage.get(pageNumber) ?? [];
    const questionLike = chunks.filter((chunk) => chunkLooksLikeQuestion(chunk.text));
    const hasQuestions = questionLike.length > 0;
    return {
      page_number: pageNumber,
      page_role: hasQuestions ? "question_page" : chunks.length ? "study_content" : "unknown",
      has_questions: hasQuestions,
      estimated_question_count: questionLike.length,
      question_markers_found: questionLike.slice(0, 6).map((chunk) => chunk.text.slice(0, 80)),
      important_notes: hasQuestions
        ? "Fallback heuristic detected question-like text."
        : "",
      should_extract_questions: hasQuestions,
      confidence: hasQuestions ? 0.45 : 0.25,
    };
  });
  const estimatedTotal = page_audit.reduce(
    (total, page) => total + page.estimated_question_count,
    0,
  );

  return {
    document_summary: {
      file_name: fileName,
      detected_title_or_exam_name: null,
      detected_subject: null,
      detected_language: [],
      document_type: "unknown",
      has_existing_questions: estimatedTotal > 0,
      needs_generated_questions: estimatedTotal === 0,
      total_pages_received: pageCount,
      estimated_distinct_question_count: estimatedTotal,
      confidence: estimatedTotal > 0 ? 0.45 : 0.25,
    },
    page_audit,
    global_warnings: ["file_intelligence_fallback_used"],
  };
}

async function recordFileIntelligenceProgress(args: {
  jobId: string;
  fileHash: string;
  clerkUserId: string;
  pageCount: number;
  sourceChunks: SourceChunk[];
  intelligence: FileIntelligence;
}) {
  const chunksByPage = groupChunksByPage(args.sourceChunks);
  const auditByPage = new Map(
    args.intelligence.page_audit.map((page) => [page.page_number, page]),
  );

  for (let pageIndex = 0; pageIndex < args.pageCount; pageIndex += 1) {
    const pageNumber = pageIndex + 1;
    const chunks = chunksByPage.get(pageNumber) ?? [];
    const audit = auditByPage.get(pageNumber);
    const candidateQuestionCount = audit?.estimated_question_count ?? 0;

    await upsertExtractionPage({
      jobId: args.jobId,
      fileHash: args.fileHash,
      clerkUserId: args.clerkUserId,
      pageIndex,
      text: chunks.map((chunk) => chunk.text).join("\n\n").slice(0, 80_000),
      mode: pageAuditMode(audit),
      candidateQuestionCount,
      status: audit?.should_extract_questions ? "processing" : "done",
    });
  }
}

async function repairPagesBelowIntelligence(args: {
  apiKey: string;
  model: string;
  repairModel: string;
  maxTokens: number;
  intelligence: FileIntelligence;
  sourceChunks: SourceChunk[];
  current: PdfMcqResult;
  trackingCtx: TrackedOpenRouterContext;
}): Promise<PdfMcqResult> {
  let result = args.current;
  const chunksByPage = groupChunksByPage(args.sourceChunks);

  for (const page of args.intelligence.page_audit) {
    const expected = Math.max(0, page.estimated_question_count);
    if (!page.should_extract_questions && !page.has_questions && expected === 0) continue;

    const actual = countExtractedForPage(result, page.page_number, args.sourceChunks);
    const globalExpected =
      args.intelligence.document_summary.estimated_distinct_question_count;
    const globalShortfall = globalExpected > result.mcqs.length;
    if (expected > 0 && actual >= expected && !globalShortfall) continue;
    if (expected === 0 && !globalShortfall) continue;

    const pageChunks = chunksByPage.get(page.page_number) ?? [];
    if (!pageChunks.length) continue;

    const repair = await requestPageRepairExtraction({
      apiKey: args.apiKey,
      model: args.repairModel || args.model,
      maxTokens: args.maxTokens,
      pageNumber: page.page_number,
      expectedQuestionCount: Math.max(expected, actual + 1),
      chunks: pageChunks,
      existingQuestions: result.mcqs.filter((mcq) =>
        mcqBelongsToPage(mcq, page.page_number, args.sourceChunks),
      ),
      trackingCtx: args.trackingCtx,
    });

    if (!repair.mcqs.length) continue;
    result = repairMissingSourceChunkIds(
      mergeBatchResults([result, repair]),
      args.sourceChunks,
    );
  }

  return result;
}

async function runSupplementalWindowExtractionIfShort(args: {
  apiKey: string;
  model: string;
  repairModel: string;
  maxTokens: number;
  extractionMode: ExtractionMode;
  intelligence: FileIntelligence;
  sourceChunks: SourceChunk[];
  allSourceChunks: SourceChunk[];
  current: PdfMcqResult;
  jobId: string;
  trackingCtx: TrackedOpenRouterContext;
  runCtx: ExtractionRunContext;
}): Promise<PdfMcqResult> {
  if (!args.sourceChunks.length) return args.current;

  const expected = args.intelligence.document_summary.estimated_distinct_question_count;
  const intelligenceConfidence = args.intelligence.document_summary.confidence;
  // Only skip supplemental if intelligence was confident AND we already met its estimate.
  // Low-confidence estimates frequently undercount — keep going to catch missed questions.
  if (expected > 0 && args.current.mcqs.length >= expected && intelligenceConfidence >= 0.75) {
    return args.current;
  }

  const supplementalResults: PdfMcqResult[] = [];
  for (const batch of splitChunksIntoBatches(args.sourceChunks)) {
    const result = await extractBatchWithSplitRetry({
      apiKey: args.apiKey,
      model: args.model,
      repairModel: args.repairModel,
      maxTokens: args.maxTokens,
      mode:
        args.extractionMode === "choices-provided" ||
        args.extractionMode === "extract-only"
          ? "make-choices"
          : args.extractionMode,
      relaxed: true,
      chunks: batch.chunks,
      trackingCtx: args.trackingCtx,
    });
    if (!("failureReason" in result)) {
      supplementalResults.push(result);
    }
  }

  if (!supplementalResults.length) return args.current;

  const supplemental = mergeBatchResults(supplementalResults);
  if (!supplemental.mcqs.length) return args.current;

  mapChunkIdsToMcqRegions(supplemental.mcqs, args.allSourceChunks);
  return repairMissingSourceChunkIds(
    mergeBatchResults([args.current, normalizeResult(supplemental)]),
    args.allSourceChunks,
  );
}

async function requestPageRepairExtraction(args: {
  apiKey: string;
  model: string;
  maxTokens: number;
  pageNumber: number;
  expectedQuestionCount: number;
  chunks: SourceChunk[];
  existingQuestions: PdfMcq[];
  trackingCtx: TrackedOpenRouterContext;
}): Promise<PdfMcqResult> {
  const blocks = args.chunks.map((chunk) => ({
    block_id: chunk.id,
    page_number: chunk.pageNumber,
    text: chunk.text,
    bbox: chunk.region
      ? [chunk.region.x, chunk.region.y, chunk.region.width, chunk.region.height]
      : undefined,
  }));
  const body = JSON.stringify({
    model: args.model,
    temperature: 0,
    top_p: 0.1,
    max_tokens: args.maxTokens,
    response_format: { type: "json_object" },
    plugins: [{ id: "response-healing" }],
    messages: [
      { role: "system", content: buildPageRepairSystemPrompt() },
      {
        role: "user",
        content: `The previous extraction missed questions.

Input:
${JSON.stringify({
  page_number: args.pageNumber,
  expected_question_count_estimate: args.expectedQuestionCount,
  page_text: args.chunks.map((chunk) => chunk.text).join("\n"),
  blocks,
  already_extracted_questions: args.existingQuestions.map((mcq) => ({
    stem: mcq.questionText ?? mcq.question ?? "",
    source_block_ids: mcq.sourceChunkIds ?? [],
    source_snippet: mcq.exactQuote ?? "",
  })),
})}

Return JSON only.`,
      },
    ],
  });

  const { response, data: rawData } = await trackedOpenRouterFetch(
    args.trackingCtx,
    args.model,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000/pdf",
        "X-Title": "TestNote PDF Extraction Repair",
      },
      body,
    },
  );

  if (!response.ok) return { title: "Repair", summary: "", mcqs: [] };

  try {
    const data = rawData as OpenRouterResponse | null;
    const rawContent = extractOpenRouterContent(data?.choices?.[0]?.message?.content);
    const parsed = parseJsonFromModel(rawContent);
    const coerced = coercePdfMcqResult(parsed);
    if (!coerced) return { title: "Repair", summary: "", mcqs: [] };
    return {
      ...coerced,
      mcqs: coerced.mcqs.map((mcq) => ({
        ...mcq,
        sourcePage: mcq.sourcePage ?? args.pageNumber,
      })),
    };
  } catch {
    return { title: "Repair", summary: "", mcqs: [] };
  }
}

function buildPageRepairSystemPrompt() {
  return `You are DrNote Extraction Repair Engine.

The previous extraction missed questions.

You will receive:
1. The original page text/blocks.
2. The questions already extracted from this page.
3. The expected question count estimate.

Your job:
- Find questions that were missed.
- Do not repeat already extracted questions.
- Return only newly found questions.
- Use exact source_block_ids and source_snippet.
- Read the entire page_text before answering. Do not rely only on previously detected chunks.
- If the page has more visible questions than already_extracted_questions, you must return the missing ones.
- If the estimate was wrong, explain that in page_repair_notes.

Return valid JSON only.

Return:
{"page_number":1,"new_questions_found":0,"new_questions":[{"question_id_temp":"q_missing_1","type":"extracted","page_number":1,"source_block_ids":["p1_b1"],"source_snippet":"Exact copied text from the input","question_number_original":null,"stem":"","options":{"A":"","B":"","C":"","D":""},"answer":{"label":null,"text":null,"found_in_source":false},"explanation":null,"duplicate_of":null,"confidence":0,"needs_review":false}],"page_repair_notes":"","final_estimated_question_count_for_page":0,"confidence":0}`;
}

function countExtractedForPage(
  result: PdfMcqResult,
  pageNumber: number,
  sourceChunks: SourceChunk[],
): number {
  return result.mcqs.filter((mcq) => mcqBelongsToPage(mcq, pageNumber, sourceChunks)).length;
}

function mcqBelongsToPage(
  mcq: PdfMcq,
  pageNumber: number,
  sourceChunks: SourceChunk[],
): boolean {
  if (mcq.sourcePage === pageNumber) return true;
  const chunkPage = new Map(sourceChunks.map((chunk) => [chunk.id, chunk.pageNumber]));
  return Boolean(mcq.sourceChunkIds?.some((id) => chunkPage.get(id) === pageNumber));
}

async function recordPageExtractionAudits(args: {
  jobId: string;
  fileHash: string;
  pageCount: number;
  sourceChunks: SourceChunk[];
  result: PdfMcqResult;
  intelligence?: FileIntelligence;
  retryCount: number;
}) {
  const chunksByPage = groupChunksByPage(args.sourceChunks);
  const mcqsByPage = groupMcqsByPage(args.result.mcqs, args.sourceChunks);
  const auditByPage = new Map(
    args.intelligence?.page_audit.map((page) => [page.page_number, page]) ?? [],
  );

  for (let pageIndex = 0; pageIndex < args.pageCount; pageIndex += 1) {
    const pageNumber = pageIndex + 1;
    const chunks = chunksByPage.get(pageNumber) ?? [];
    const mcqs = mcqsByPage.get(pageNumber) ?? [];
    const intelligenceAudit = auditByPage.get(pageNumber);
    const candidateQuestionCount =
      intelligenceAudit?.estimated_question_count ??
      chunks.filter((chunk) => chunkLooksLikeQuestion(chunk.text)).length;
    const needsReviewCount = mcqs.filter((mcq) => mcq.status === "needs_review").length;
    const incompleteCount = mcqs.filter((mcq) => {
      const optionCount = mcq.options?.length ?? mcq.choices?.length ?? 0;
      return optionCount < 2 || !(mcq.correctAnswer ?? mcq.answer ?? "").trim();
    }).length;
    const status =
      needsReviewCount > 0 || mcqs.length < candidateQuestionCount
        ? "partial"
        : "passed";
    const warnings: string[] = [];
    if (mcqs.length < candidateQuestionCount) {
      warnings.push("extracted_less_than_candidate_count");
    }
    if (needsReviewCount > 0) warnings.push("needs_review_items_present");

    await upsertExtractionPageAudit({
      jobId: args.jobId,
      fileHash: args.fileHash,
      pageIndex,
      mode: pageAuditMode(intelligenceAudit),
      candidateQuestionCount,
      extractedQuestionCount: mcqs.length,
      generatedQuestionCount: 0,
      incompleteCount,
      needsReviewCount,
      retryCount: args.retryCount,
      status,
      warnings,
    });

    await upsertExtractionPage({
      jobId: args.jobId,
      fileHash: args.fileHash,
      pageIndex,
      mode: pageAuditMode(intelligenceAudit),
      candidateQuestionCount,
      status: status === "partial" ? "needs_review" : "done",
    });
  }
}

function pageAuditMode(page?: FileIntelligence["page_audit"][number]) {
  if (!page) return "noise" as const;
  if (page.has_questions || page.estimated_question_count > 0) {
    return page.page_role === "mixed" ? "mixed" : "existing_questions";
  }
  return page.page_role === "study_content" ? "study_content" : "noise";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableTrimmedString(value: unknown): string | null {
  const text = asTrimmedString(value);
  return text ? text : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean)
    .slice(0, 20);
}

function groupChunksByPage(chunks: SourceChunk[]): Map<number, SourceChunk[]> {
  const grouped = new Map<number, SourceChunk[]>();
  for (const chunk of chunks) {
    const list = grouped.get(chunk.pageNumber) ?? [];
    list.push(chunk);
    grouped.set(chunk.pageNumber, list);
  }
  return grouped;
}

function groupMcqsByPage(
  mcqs: PdfMcq[],
  sourceChunks: SourceChunk[],
): Map<number, PdfMcq[]> {
  const chunkPage = new Map(sourceChunks.map((chunk) => [chunk.id, chunk.pageNumber]));
  const grouped = new Map<number, PdfMcq[]>();

  for (const mcq of mcqs) {
    const pageNumber =
      mcq.sourcePage ??
      mcq.sourceChunkIds?.map((id) => chunkPage.get(id)).find((page) => page);
    if (!pageNumber) continue;

    const list = grouped.get(pageNumber) ?? [];
    list.push(mcq);
    grouped.set(pageNumber, list);
  }

  return grouped;
}

async function returnCachedExtraction(args: {
  cached: CachedExtractionPayload;
  cacheKey: ExtractionCacheKey;
  fileHash: string;
  fileName: string;
  pageCount: number;
  clerkUserId: string;
  model: string;
  startedAt: number;
  runCtx: ExtractionRunContext;
  inFlightHit: boolean;
  jobId?: string;
}): Promise<ExtractionSuccessResponse> {
  const sourceReady = await attachServerSourcePreviews({
    result: {
      title: args.cached.title,
      summary: args.cached.summary,
      mcqs: args.cached.mcqs,
    },
    sourceChunks: args.cached.sourceChunks,
    fileId: args.fileHash,
  });
  void commitCacheHitUsage({
    clerkUserId: args.clerkUserId,
    fileHash: args.fileHash,
    feature: "extract",
    model: args.model,
  });
  logExtractionAttempt({
    fileHash: args.fileHash,
    fileName: args.fileName,
    pageCount: args.pageCount,
    attemptNumber: 1,
    cached: true,
    inFlightHit: args.inFlightHit,
    openRouterCalled: false,
    ...extractionCostFields(args.runCtx, args.cached.mcqs.length),
    model: args.model,
    durationMs: Date.now() - args.startedAt,
  });
  logExtractionCacheKey({
    ...args.cacheKey,
    cacheHit: true,
    inFlightHit: args.inFlightHit,
    openRouterCalled: false,
  });
  await persistPdfExtractionRecord({
    clerkUserId: args.clerkUserId,
    fileHash: args.fileHash,
    fileName: args.fileName,
    pageCount: args.pageCount,
    extractionMode: args.cacheKey.extractionMode,
    extractionModel: args.cacheKey.extractionModel,
    appExtractionVersion: args.cacheKey.appExtractionVersion,
    title: sourceReady.result.title,
    summary: sourceReady.result.summary,
    mcqs: sourceReady.result.mcqs,
    sourceChunks: args.cached.sourceChunks,
  });
  if (args.jobId) {
    await updateExtractionJob(args.jobId, {
      status: "ready",
      progressPagesProcessed: args.pageCount,
    });
  }
  return {
    title: sourceReady.result.title,
    summary: sourceReady.result.summary,
    mcqs: sourceReady.result.mcqs,
    fileHash: args.fileHash,
    fileName: args.fileName,
    pageCount: args.pageCount,
    sourceChunks: args.cached.sourceChunks,
    cached: true,
    inFlightHit: args.inFlightHit || undefined,
  };
}

async function waitForDistributedExtraction(args: {
  claim: Extract<DistributedExtractionClaim, { owner: false }>;
  cacheKey: ExtractionCacheKey;
  fileHash: string;
  fileName: string;
  pageCount: number;
  clerkUserId: string;
  model: string;
  startedAt: number;
  runCtx: ExtractionRunContext;
}): Promise<ExtractionSuccessResponse | ExtractionErrorResponse> {
  const deadline = Date.now() + getEnvMs("EXTRACTION_LOCK_WAIT_MS", 30_000);

  while (Date.now() <= deadline) {
    const cached = await lookupExtractionCache(args.cacheKey);
    if (cached) {
      return returnCachedExtraction({
        cached,
        cacheKey: args.cacheKey,
        fileHash: args.fileHash,
        fileName: args.fileName,
        pageCount: args.pageCount,
        clerkUserId: args.clerkUserId,
        model: args.model,
        startedAt: args.startedAt,
        runCtx: args.runCtx,
        inFlightHit: true,
        jobId: args.claim.jobId,
      });
    }

    const job = await getDistributedExtractionJob(args.claim.jobId);
    if (job?.status === "failed") {
      const reason = job.failureReason ?? "unknown_transient_error";
      const payload = buildFailureResponse(reason, {
        error: job.error,
      });
      logExtractionCacheKey({
        ...args.cacheKey,
        cacheHit: false,
        inFlightHit: true,
        openRouterCalled: false,
      });
      return { ...payload, jobId: args.claim.jobId };
    }

    if (job?.status === "ready") {
      await jitteredDelay(250, 500);
      continue;
    }

    await jitteredDelay(750, 1250);
  }

  const payload = buildFailureResponse("unknown_transient_error", {
    error: "Extraction is already processing. Try again shortly.",
  });
  logExtractionCacheKey({
    ...args.cacheKey,
    cacheHit: false,
    inFlightHit: true,
    openRouterCalled: false,
  });
  return { ...payload, jobId: args.claim.jobId };
}

function getEnvMs(envKey: string, fallbackMs: number) {
  const parsed = Number(process.env[envKey]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function getEnvNumber(envKey: string, fallback: number) {
  const parsed = Number(process.env[envKey]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function finalizeExtraction(args: {
  apiKey: string;
  cacheKey: ExtractionCacheKey;
  fileHash: string;
  fileName: string;
  extractionMode: ExtractionMode;
  clerkUserId: string;
  pageCount: number;
  normalized: PdfMcqResult;
  sourceChunks: SourceChunk[];
  jobId: string;
  reservationId?: string;
  runCtx: ExtractionRunContext;
}): Promise<ExtractionSuccessResponse> {
  let result = args.normalized;

  if (shouldAutoFixGrammar()) {
    result = await applyGrammarFix(args.apiKey, result, {
      clerkUserId: args.clerkUserId,
      feature: "grammar",
      jobId: args.jobId,
      fileHash: args.fileHash,
      reservationId: args.reservationId,
    });
  }

  const sourceReady = await attachServerSourcePreviews({
    result,
    sourceChunks: args.sourceChunks,
    fileId: args.fileHash,
  });
  result = sourceReady.result;

  const payload: Omit<CachedExtractionPayload, "cachedAt"> = {
    title: result.title,
    summary: result.summary,
    mcqs: result.mcqs,
    sourceChunks: args.sourceChunks,
  };

  await persistExtractionCache(args.cacheKey, payload, args.pageCount);
  await persistPdfExtractionRecord({
    clerkUserId: args.clerkUserId,
    fileHash: args.fileHash,
    fileName: args.fileName,
    pageCount: args.pageCount,
    extractionMode: args.extractionMode,
    extractionModel: args.cacheKey.extractionModel,
    appExtractionVersion: args.cacheKey.appExtractionVersion,
    title: result.title,
    summary: result.summary,
    mcqs: result.mcqs,
    sourceChunks: args.sourceChunks,
  });

  await updateExtractionJob(args.jobId, {
    status: "ready",
    progressPagesProcessed: args.pageCount,
  });
  void sendExtractionJobEmail({
    clerkUserId: args.clerkUserId,
    fileName: args.fileName,
    status: result.mcqs.some((mcq) => mcq.status === "needs_review")
      ? "needs_review"
      : "ready",
    questionCount: result.mcqs.length,
    needsReviewCount: result.mcqs.filter((mcq) => mcq.status === "needs_review").length,
  });

  if (args.reservationId) {
    await releaseQuotaReservation(args.reservationId);
  }

  logExtractionAttempt({
    fileHash: args.runCtx.fileHash,
    fileName: args.runCtx.fileName,
    pageCount: args.runCtx.pageCount,
    attemptNumber: args.runCtx.attemptNumber,
    sampledTextItemCount: args.runCtx.probe?.sampledTextItemCount,
    sampledTextCharCount: args.runCtx.probe?.sampledTextCharCount,
    sourceChunksCount: args.sourceChunks.length,
    sourcePreviewsGenerated: sourceReady.report.generatedPreviews,
    sourcePreviewFailures: sourceReady.report.previewFailures,
    ...extractionCostFields(args.runCtx, result.mcqs.length),
    model: args.runCtx.model,
    batchCount: args.runCtx.batchCount,
    openRouterCalled: args.runCtx.openRouterCalled,
    durationMs: Date.now() - args.runCtx.startedAt,
  });
  logExtractionCacheKey({
    ...args.cacheKey,
    cacheHit: false,
    inFlightHit: false,
    openRouterCalled: args.runCtx.openRouterCalled,
  });

  return {
    ...result,
    fileHash: args.fileHash,
    fileName: args.fileName,
    pageCount: args.pageCount,
    sourceChunks: args.sourceChunks,
  };
}

async function runChunkBatchedExtraction(args: {
  apiKey: string;
  model: string;
  repairModel: string;
  maxTokens: number;
  extractionMode: ExtractionMode;
  sourceChunks: SourceChunk[];
  jobId: string;
  trackingCtx: TrackedOpenRouterContext;
  runCtx: ExtractionRunContext;
}): Promise<PdfMcqResult | ExtractionErrorResponse> {
  const batches = splitChunksIntoBatches(args.sourceChunks);
  const extractionAttempts: Array<{ mode: ExtractionMode; relaxed: boolean }> = [
    { mode: args.extractionMode, relaxed: false },
    {
      mode:
        args.extractionMode === "choices-provided" ||
        args.extractionMode === "extract-only"
          ? "make-choices"
          : args.extractionMode,
      relaxed: true,
    },
  ];

  let lastModelFailure: ExtractionFailureReason | null = null;
  let lastFailureOverrides: { error?: string; hint?: string } | undefined;
  const failedBatchIndexes: number[] = [];

  for (const [attemptIndex, attempt] of extractionAttempts.entries()) {
    const batchResults: PdfMcqResult[] = [];

    for (const [batchIndex, batch] of batches.entries()) {
      const chunkResult = await extractBatchWithSplitRetry({
        apiKey: args.apiKey,
        model: args.model,
        repairModel: args.repairModel,
        maxTokens: args.maxTokens,
        mode: attempt.mode,
        relaxed: attempt.relaxed,
        chunks: batch.chunks,
        trackingCtx: args.trackingCtx,
      });

      if ("failureReason" in chunkResult) {
        lastModelFailure = chunkResult.failureReason;
        lastFailureOverrides = { error: chunkResult.error, hint: chunkResult.hint };
        failedBatchIndexes.push(batchIndex);
        batchResults.length = 0;
        break;
      }

      batchResults.push(chunkResult);

      const pagesInBatch = new Set(batch.chunks.map((chunk) => chunk.pageNumber)).size;
      await updateExtractionJob(args.jobId, {
        status: "processing",
        progressPagesProcessed: Math.min(
          args.sourceChunks.length,
          (batchIndex + 1) * pagesInBatch,
        ),
      });
    }

    if (!batchResults.length) {
      if (attemptIndex < extractionAttempts.length - 1) continue;
      break;
    }

    let merged = repairMissingSourceChunkIds(
      mergeBatchResults(batchResults),
      args.sourceChunks,
    );
    merged = await recoverMissingChunkQuestions({
      ...args,
      mode: attempt.mode,
      chunks: args.sourceChunks,
      current: merged,
    });
    if (merged.mcqs.length) {
      args.runCtx.failedBatchIndexes = failedBatchIndexes;
      return merged;
    }

    lastModelFailure = "model_empty_mcqs";
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[pdf-extraction] Empty mcqs after batch merge (${attempt.mode}${attempt.relaxed ? ", relaxed" : ""})`,
      );
    }
  }

  args.runCtx.failedBatchIndexes = failedBatchIndexes;

  const failureReason =
    lastModelFailure ??
    (args.sourceChunks.length > 0
      ? "selectable_text_found_but_no_questions"
      : "model_empty_mcqs");

  return failExtraction({
    jobId: args.jobId,
    reason: failureReason,
    ctx: args.runCtx,
    overrides:
      lastFailureOverrides ??
      (failureReason === "selectable_text_found_but_no_questions"
        ? undefined
        : failureReason === "model_empty_mcqs"
          ? {
              error: buildEmptyMcqError(args.extractionMode),
              hint: buildEmptyMcqHint(args.extractionMode),
            }
          : undefined),
  });
}

async function runPageLevelExtraction(args: {
  apiKey: string;
  model: string;
  repairModel: string;
  maxTokens: number;
  extractionMode: ExtractionMode;
  sourceChunks: SourceChunk[];
  jobId: string;
  trackingCtx: TrackedOpenRouterContext;
  runCtx: ExtractionRunContext;
}): Promise<PdfMcqResult | ExtractionErrorResponse> {
  const pageEntries = [...groupChunksByPage(args.sourceChunks).entries()].sort(
    ([a], [b]) => a - b,
  );
  if (!pageEntries.length) {
    return runChunkBatchedExtraction(args);
  }

  const extractionAttempts: Array<{ mode: ExtractionMode; relaxed: boolean }> = [
    { mode: args.extractionMode, relaxed: false },
    {
      mode:
        args.extractionMode === "choices-provided" ||
        args.extractionMode === "extract-only"
          ? "make-choices"
          : args.extractionMode,
      relaxed: true,
    },
  ];
  const failedBatchIndexes: number[] = [];

  for (const attempt of extractionAttempts) {
    const pageResults: PdfMcqResult[] = [];

    for (const [pageNumber, pageChunks] of pageEntries) {
      const result = await extractBatchWithSplitRetry({
        apiKey: args.apiKey,
        model: args.model,
        repairModel: args.repairModel,
        maxTokens: args.maxTokens,
        mode: attempt.mode,
        relaxed: attempt.relaxed,
        chunks: pageChunks,
        trackingCtx: args.trackingCtx,
      });

      if ("failureReason" in result) {
        failedBatchIndexes.push(pageNumber);
      } else {
        pageResults.push(result);
      }

      await updateExtractionJob(args.jobId, {
        status: "processing",
        progressPagesProcessed: Math.min(pageEntries.length, pageResults.length),
      });
    }

    if (pageResults.length) {
      let merged = repairMissingSourceChunkIds(
        mergeBatchResults(pageResults),
        args.sourceChunks,
      );
      merged = await recoverMissingChunkQuestions({
        ...args,
        mode: attempt.mode,
        chunks: args.sourceChunks,
        current: merged,
      });
      args.runCtx.failedBatchIndexes = failedBatchIndexes;
      return merged;
    }
  }

  args.runCtx.failedBatchIndexes = failedBatchIndexes;
  return runChunkBatchedExtraction(args);
}

async function extractBatchWithSplitRetry(args: {
  apiKey: string;
  model: string;
  repairModel: string;
  maxTokens: number;
  mode: ExtractionMode;
  relaxed: boolean;
  chunks: SourceChunk[];
  trackingCtx: TrackedOpenRouterContext;
  repair?: boolean;
}): Promise<PdfMcqResult | ExtractionErrorResponse> {
  const chunkResult = await requestChunkMcqExtraction({
    apiKey: args.apiKey,
    model: args.repair ? args.repairModel : args.model,
    maxTokens: args.maxTokens,
    mode: args.mode,
    relaxed: args.relaxed,
    chunks: args.chunks,
    trackingCtx: args.trackingCtx,
    repair: args.repair ?? false,
  });

  if ("error" in chunkResult) {
    return {
      ...buildFailureResponse("openrouter_error", { error: chunkResult.error }),
      jobId: "",
    };
  }

  if ("parseError" in chunkResult) {
    if (!args.repair) {
      const repaired = await requestChunkMcqExtraction({
        ...args,
        model: args.repairModel,
        repair: true,
      });
      if (!("parseError" in repaired) && !("error" in repaired)) {
        return repaired.coerced;
      }
    }

    if (args.chunks.length > 1) {
      const mid = Math.ceil(args.chunks.length / 2);
      const left = await extractBatchWithSplitRetry({
        ...args,
        chunks: args.chunks.slice(0, mid),
        repair: false,
      });
      const right = await extractBatchWithSplitRetry({
        ...args,
        chunks: args.chunks.slice(mid),
        repair: false,
      });

      if ("failureReason" in left || "failureReason" in right) {
        const leftFailed = "failureReason" in left;
        const rightFailed = "failureReason" in right;
        if (leftFailed && rightFailed) {
          return left;
        }
        return "failureReason" in left ? right : left;
      }

      return mergeBatchResults([left, right]);
    }

    const reason =
      chunkResult.parseError === "invalid-json"
        ? "model_invalid_json"
        : chunkResult.parseError === "empty-mcqs"
          ? "model_empty_mcqs"
          : "model_invalid_schema";

    return {
      ...buildFailureResponse(reason),
      jobId: "",
    };
  }

  return chunkResult.coerced;
}

async function runFullFileExtraction(args: {
  apiKey: string;
  model: string;
  repairModel: string;
  maxTokens: number;
  extractionMode: ExtractionMode;
  fileName: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
  jobId: string;
  trackingCtx: TrackedOpenRouterContext;
  runCtx: ExtractionRunContext;
}): Promise<(PdfMcqResult & { sourceChunks: SourceChunk[] }) | ExtractionErrorResponse> {
  const base64File = Buffer.from(args.arrayBuffer).toString("base64");
  const filePayload: McqFilePayload = {
    filename: args.fileName,
    file_data: `data:${args.mimeType};base64,${base64File}`,
  };

  const extractionAttempts: Array<{ mode: ExtractionMode; relaxed: boolean }> = [
    { mode: args.extractionMode, relaxed: false },
    {
      mode:
        args.extractionMode === "choices-provided" ||
        args.extractionMode === "extract-only"
          ? "make-choices"
          : args.extractionMode,
      relaxed: true,
    },
  ];

  let coerced: PdfMcqResult | null = null;
  let lastModelFailure: ExtractionFailureReason | null = null;

  for (const [attemptIndex, attempt] of extractionAttempts.entries()) {
    const extractionResult = await requestMcqExtraction({
      apiKey: args.apiKey,
      model: args.model,
      maxTokens: args.maxTokens,
      mode: attempt.mode,
      relaxed: attempt.relaxed,
      filePayload,
      trackingCtx: args.trackingCtx,
      repair: false,
    });

    if ("error" in extractionResult) {
      if (attemptIndex === extractionAttempts.length - 1) {
        return failExtraction({
          jobId: args.jobId,
          reason: "openrouter_error",
          ctx: args.runCtx,
          overrides: { error: extractionResult.error },
        });
      }
      continue;
    }

    if ("parseError" in extractionResult) {
      const repaired = await requestMcqExtraction({
        apiKey: args.apiKey,
        model: args.repairModel,
        maxTokens: args.maxTokens,
        mode: attempt.mode,
        relaxed: attempt.relaxed,
        filePayload,
        trackingCtx: args.trackingCtx,
        repair: true,
      });

      if ("parseError" in repaired || "error" in repaired) {
        lastModelFailure =
          extractionResult.parseError === "invalid-json"
            ? "model_invalid_json"
            : extractionResult.parseError === "empty-mcqs"
              ? "model_empty_mcqs"
              : "model_invalid_schema";
        continue;
      }

      coerced = repaired.coerced;
    } else {
      coerced = extractionResult.coerced;
    }

    if (!coerced) {
      lastModelFailure = "model_invalid_schema";
      continue;
    }
    if (coerced.mcqs.length > 0) break;
    lastModelFailure = "model_empty_mcqs";
  }

  if (!coerced) {
    return failExtraction({
      jobId: args.jobId,
      reason: lastModelFailure ?? "model_invalid_schema",
      ctx: args.runCtx,
    });
  }

  if (!coerced.mcqs.length) {
    return failExtraction({
      jobId: args.jobId,
      reason: "model_empty_mcqs",
      ctx: args.runCtx,
      overrides: {
        error: buildEmptyMcqError(args.extractionMode),
        hint: buildEmptyMcqHint(args.extractionMode),
      },
    });
  }

  return { ...normalizeResult(coerced), sourceChunks: [] };
}

function mergeBatchResults(results: PdfMcqResult[]): PdfMcqResult {
  const mcqs: PdfMcq[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const mcq of result.mcqs) {
      const dedupeKey =
        mcq.sourceChunkIds?.slice().sort().join("|") ??
        `${mcq.questionNumber ?? ""}:${(mcq.questionText ?? mcq.question ?? "").slice(0, 80)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      mcqs.push(mcq);
    }
  }

  mcqs.sort((a, b) => (a.questionNumber ?? 0) - (b.questionNumber ?? 0));

  return {
    title: results.find((item) => item.title.trim())?.title.trim() || "Extracted questions",
    summary: results.find((item) => item.summary.trim())?.summary.trim() || "",
    mcqs,
  };
}

async function recoverMissingChunkQuestions(args: {
  apiKey: string;
  model: string;
  repairModel: string;
  maxTokens: number;
  mode: ExtractionMode;
  chunks: SourceChunk[];
  current: PdfMcqResult;
  trackingCtx: TrackedOpenRouterContext;
}): Promise<PdfMcqResult> {
  let recovered = repairMissingSourceChunkIds(args.current, args.chunks);
  const missing = findUncoveredQuestionChunks(args.chunks, recovered);
  if (!missing.length) return recovered;

  const recoveryResults: PdfMcqResult[] = [];
  for (const batch of splitChunksIntoBatches(missing)) {
    const result = await extractBatchWithSplitRetry({
      apiKey: args.apiKey,
      model: args.model,
      repairModel: args.repairModel,
      maxTokens: args.maxTokens,
      mode: args.mode,
      relaxed: true,
      chunks: batch.chunks,
      trackingCtx: args.trackingCtx,
    });
    if (!("failureReason" in result)) recoveryResults.push(result);
  }

  if (recoveryResults.length) {
    recovered = repairMissingSourceChunkIds(
      mergeBatchResults([recovered, ...recoveryResults]),
      args.chunks,
    );
  }

  const fallbackMcqs = findUncoveredQuestionChunks(args.chunks, recovered)
    .map((chunk, index) => buildMcqFromSourceChunk(chunk, recovered.mcqs.length + index))
    .filter((mcq): mcq is PdfMcq => Boolean(mcq));

  if (fallbackMcqs.length) {
    recovered = removeUngroundedDuplicates(recovered, fallbackMcqs);
    recovered = repairMissingSourceChunkIds(
      mergeBatchResults([
        recovered,
        { title: recovered.title, summary: recovered.summary, mcqs: fallbackMcqs },
      ]),
      args.chunks,
    );
  }

  if (
    process.env.NODE_ENV === "development" &&
    findUncoveredQuestionChunks(args.chunks, recovered).length > 0
  ) {
    console.warn(
      `[pdf-extraction] Extracted ${recovered.mcqs.length}/${args.chunks.length} chunk-backed questions after coverage repair.`,
    );
  }

  return recovered;
}

function findUncoveredQuestionChunks(chunks: SourceChunk[], result: PdfMcqResult): SourceChunk[] {
  const covered = new Set(
    result.mcqs.flatMap((mcq) => mcq.sourceChunkIds ?? []).filter(Boolean),
  );
  return chunks.filter((chunk) => !covered.has(chunk.id) && chunkLooksLikeQuestion(chunk.text));
}

function removeUngroundedDuplicates(
  result: PdfMcqResult,
  groundedFallbacks: PdfMcq[],
): PdfMcqResult {
  const mcqs = result.mcqs.filter((mcq) => {
    if (mcq.sourceChunkIds?.length) return true;
    const text = normalizeForSimilarity(mcq.questionText ?? mcq.question ?? "");
    if (!text) return true;
    return !groundedFallbacks.some((fallback) => {
      const fallbackText = normalizeForSimilarity(
        [fallback.questionText, fallback.exactQuote].filter(Boolean).join(" "),
      );
      return tokenOverlapScore(text, fallbackText) >= 0.35;
    });
  });

  return { ...result, mcqs };
}

function repairMissingSourceChunkIds(result: PdfMcqResult, chunks: SourceChunk[]): PdfMcqResult {
  const used = new Set(result.mcqs.flatMap((mcq) => mcq.sourceChunkIds ?? []));
  const mcqs = result.mcqs.map((mcq) => {
    if (mcq.sourceChunkIds?.length) return mcq;

    const best = findBestChunkForMcq(mcq, chunks, used);
    if (!best) return mcq;
    used.add(best.id);
    return {
      ...mcq,
      sourceChunkIds: [best.id],
      sourcePage: best.pageNumber,
      sourceRegion: best.region,
    };
  });

  return { ...result, mcqs };
}

function findBestChunkForMcq(
  mcq: PdfMcq,
  chunks: SourceChunk[],
  used: Set<string>,
): SourceChunk | null {
  const questionText = normalizeForSimilarity(mcq.questionText ?? mcq.question ?? "");
  if (!questionText) return null;

  let best: { chunk: SourceChunk; score: number } | null = null;
  for (const chunk of chunks) {
    if (used.has(chunk.id)) continue;
    const score = tokenOverlapScore(questionText, normalizeForSimilarity(chunk.text));
    if (!best || score > best.score) best = { chunk, score };
  }

  return best && best.score >= 0.45 ? best.chunk : null;
}

function buildMcqFromSourceChunk(chunk: SourceChunk, index: number): PdfMcq | null {
  const parts = splitTextByOptionLabels(chunk.text);
  if (!chunkLooksLikeQuestion(chunk.text) || parts.options.length === 0) return null;

  const questionText = formatQuestionText(extractFallbackQuestionStem(parts.stem));
  if (!questionText) return null;

  return {
    questionNumber: parseChunkQuestionNumber(chunk.text) ?? index + 1,
    questionText,
    options: parts.options.slice(0, 5).map((option) => ({
      label: option.label,
      text: formatOptionText(option.text),
    })),
    correctAnswer: parseCorrectAnswer(chunk.text) ?? "",
    notes: [],
    sourceChunkIds: [chunk.id],
    sourcePage: chunk.pageNumber,
    sourceRegion: chunk.region,
    exactQuote: chunk.text.slice(0, 180),
    rawJson: {
      generated: false,
      sourceFallback: true,
      reason: "model_coverage_repair",
    },
    status: "needs_review",
  };
}

function extractFallbackQuestionStem(stem: string): string {
  const normalized = normalizeLineForParsing(stem);
  const questionSentences = Array.from(
    normalized.matchAll(/(?:^|[.!?]\s+)([^.!?]*\?)/g),
  ).map((match) => match[1]?.trim()).filter(Boolean);
  const candidate = questionSentences.at(-1);
  return (candidate ?? normalized).replace(/^-+\s*/, "").trim();
}

function chunkLooksLikeQuestion(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  if (countQuestionCandidateSignals(normalized) > 0) return true;
  if (splitTextByOptionLabels(normalized).options.length > 0 && normalized.includes("?")) {
    return true;
  }
  if (hasQuestionIntent(normalized)) {
    return splitTextByOptionLabels(normalized).options.length > 0;
  }
  return false;
}

function splitTextByOptionLabels(text: string): {
  stem: string;
  options: Array<{ label: string; text: string }>;
} {
  const normalized = normalizeLineForParsing(text);
  const matches = Array.from(normalized.matchAll(/(?:^|\s)([A-Ea-e])[\.\):\-]\s+/g));
  if (!matches.length) return { stem: normalized, options: [] };

  const first = matches[0]!;
  const stem = normalized.slice(0, first.index).trim();
  const options = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length ? matches[index + 1]!.index ?? normalized.length : normalized.length;
    return {
      label: match[1]!.toUpperCase(),
      text: normalized.slice(start, end).trim(),
    };
  });

  return { stem, options };
}

function parseChunkQuestionNumber(text: string): number | undefined {
  return parseLeadingQuestionNumber(normalizeLineForParsing(text)) ?? undefined;
}

function parseCorrectAnswer(text: string): string | undefined {
  const match = normalizeLineForParsing(text).match(
    /(?:correct answer|answer|ans\.?)\s*[:.\-]\s*([A-E])\b/i,
  );
  return match?.[1]?.toUpperCase();
}

function normalizeForSimilarity(text: string) {
  return normalizeLineForParsing(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapScore(a: string, b: string) {
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;

  let hits = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) hits += 1;
  }
  return hits / aTokens.size;
}

async function requestMcqExtraction({
  apiKey,
  model,
  maxTokens,
  mode,
  relaxed,
  filePayload,
  trackingCtx,
  repair,
}: {
  apiKey: string;
  model: string;
  maxTokens: number;
  mode: ExtractionMode;
  relaxed?: boolean;
  filePayload: McqFilePayload;
  trackingCtx: TrackedOpenRouterContext;
  repair?: boolean;
}): Promise<
  McqExtractionSuccess | McqExtractionParseError | McqExtractionSchemaError | McqExtractionFailure
> {
  const body = JSON.stringify({
    model,
    temperature: 0,
    top_p: 0.1,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    plugins: [{ id: "response-healing" }],
    messages: [
      { role: "system", content: buildSystemPrompt(mode, relaxed, repair) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: repair
              ? buildRepairExtractionPrompt(mode)
              : buildExtractionPrompt(mode, relaxed),
          },
          { type: "file", file: filePayload },
        ],
      },
    ],
  });

  const { response, data: rawData } = await trackedOpenRouterFetch(trackingCtx, model, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000/pdf",
      "X-Title": "TestNote PDF MCQ Generator",
    },
    body,
  });

  if (!response.ok) {
    const data = rawData as OpenRouterResponse | null;
    return {
      error: data?.error?.message ?? "OpenRouter request failed.",
      status: response.status,
    };
  }

  return parseModelMcqResponse(rawData);
}

async function requestChunkMcqExtraction({
  apiKey,
  model,
  maxTokens,
  mode,
  relaxed,
  chunks,
  trackingCtx,
  repair,
}: {
  apiKey: string;
  model: string;
  maxTokens: number;
  mode: ExtractionMode;
  relaxed?: boolean;
  chunks: SourceChunk[];
  trackingCtx: TrackedOpenRouterContext;
  repair?: boolean;
}): Promise<
  McqExtractionSuccess | McqExtractionParseError | McqExtractionSchemaError | McqExtractionFailure
> {
  const chunksForModel = chunks.map((chunk) => ({
    block_id: chunk.id,
    page_number: chunk.pageNumber,
    text: chunk.text,
    bbox: chunk.region
      ? [chunk.region.x, chunk.region.y, chunk.region.width, chunk.region.height]
      : undefined,
  }));

  const body = JSON.stringify({
    model,
    temperature: 0,
    top_p: 0.1,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    plugins: [{ id: "response-healing" }],
    messages: [
      { role: "system", content: buildSystemPrompt(mode, relaxed, repair) },
      {
        role: "user",
        content: repair
          ? buildRepairChunkExtractionPrompt(mode, chunksForModel)
          : buildChunkExtractionPrompt(mode, relaxed ?? false, chunksForModel),
      },
    ],
  });

  const { response, data: rawData } = await trackedOpenRouterFetch(trackingCtx, model, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000/pdf",
      "X-Title": "TestNote PDF MCQ Generator",
    },
    body,
  });

  if (!response.ok) {
    const data = rawData as OpenRouterResponse | null;
    return {
      error: data?.error?.message ?? "OpenRouter request failed.",
      status: response.status,
    };
  }

  return parseModelMcqResponse(rawData);
}

function parseModelMcqResponse(
  rawData: unknown,
):
  | McqExtractionSuccess
  | McqExtractionParseError
  | McqExtractionSchemaError
  | McqExtractionFailure {
  const data = rawData as OpenRouterResponse | null;
  const rawContent = extractOpenRouterContent(data?.choices?.[0]?.message?.content);
  if (!rawContent) {
    return { error: "OpenRouter returned an empty response.", status: 502 };
  }

  let parsed: unknown;
  try {
    parsed = parseJsonFromModel(rawContent);
  } catch {
    return { parsed: null, coerced: null, rawContent, parseError: "invalid-json" };
  }

  const validated = validateMcqExtractionResponse(parsed);
  if (!validated.ok) {
    return {
      parsed,
      coerced: null,
      rawContent,
      parseError: validated.reason === "model_empty_mcqs" ? "empty-mcqs" : "invalid-schema",
    };
  }

  return { parsed, coerced: validated.result, rawContent };
}

function buildChunkExtractionPrompt(
  mode: ExtractionMode,
  relaxed: boolean,
  blocks: Array<{
    block_id: string;
    page_number: number;
    text: string;
    bbox?: number[];
  }>,
) {
  const pages = blocksToPageInput(blocks);
  const modeHint =
    mode === "choices-provided" && !relaxed
      ? "Only extract questions that already include answer choices in the source."
      : "Extract every real question you can find, even if the answer is missing.";

  return `Analyze the following parsed PDF pages.

Task:
1. FIRST scan ALL pages and find the highest question number visible (e.g. "12." means at least 12 questions).
2. Extract EVERY distinct question — do not stop until you have extracted all of them.
3. Attach exact source references to each question.
4. Mark whether the document already contains questions or whether DrNote should generate new questions from the material.

Rules:
- ${modeHint}
- Before writing a single question, count ALL questions visible in page_text across every page. Use the highest numbered marker as your target count.
- Every extracted question must include page_number, source_block_ids, and source_snippet.
- Use only source_block_ids that exist in the input.
- source_snippet must be an exact short copied substring from the input.
- Read ALL page_text first to count every visible question, then use blocks only to attach source IDs.
- Do NOT stop after the first few questions. Keep going until every real question visible in page_text is in the output.
- If page_text has numbered questions 1-12, the output MUST include all 12 distinct questions unless some are clearly duplicates.
- If a question stem is on one page and its options on another, combine them into one question entry.
- Never invent a source.
- Never invent an answer unless the input clearly contains it. If no answer is present, use {"label":"","text":"","found_in_source":false}.
- If choices are missing, keep options empty. Do not fabricate options in this extraction pass.
- Deduplicate repeated copies of the same question.
- Ignore headings, page numbers, watermarks, Telegram links, captions, explanations, and non-question numbered lists.
- Return valid JSON only. No markdown.

Input JSON:
${JSON.stringify({ document_id: "current_upload", pages })}

Return JSON in this exact structure:
{"title":"short content-based document name","summary":"max 20 words","document_has_questions":true,"distinct_question_count":0,"confidence":0,"pages_summary":[{"page_number":1,"question_count":0,"notes":""}],"questions":[{"question_id_temp":"q1","type":"extracted","page_number":1,"source_block_ids":["p1_b1"],"source_snippet":"Exact copied text from the input","question_number_original":"1","stem":"Question stem here","options":{"A":"","B":"","C":"","D":""},"answer":{"label":"","text":"","found_in_source":false},"explanation":null,"tags":[],"difficulty":null,"confidence":0,"duplicate_group":null}],"generation_needed":false,"generation_reason":null,"warnings":[]}`;
}

function buildRepairChunkExtractionPrompt(
  mode: ExtractionMode,
  blocks: Array<{
    block_id: string;
    page_number: number;
    text: string;
    bbox?: number[];
  }>,
) {
  return `Your previous response was invalid JSON or did not match the required source-first extraction schema. Return ONLY valid JSON with keys title, summary, document_has_questions, distinct_question_count, pages_summary, and questions. Each question needs stem, page_number, source_block_ids, source_snippet, options object, and answer object. Do not invent sources or answers. Mode: ${mode}.

Input JSON:
${JSON.stringify({ document_id: "current_upload", pages: blocksToPageInput(blocks) })}`;
}

function buildRepairExtractionPrompt(mode: ExtractionMode) {
  return `Your previous response was invalid JSON or did not match the required MCQ schema. Return ONLY valid JSON with keys title, summary, and mcqs (non-empty array). Each mcq needs questionNumber, questionText, options (at least 4), and correctAnswer. Mode: ${mode}.`;
}

function blocksToPageInput(
  blocks: Array<{
    block_id: string;
    page_number: number;
    text: string;
    bbox?: number[];
  }>,
) {
  const pagesByNumber = new Map<
    number,
    Array<{ block_id: string; text: string; bbox?: number[] }>
  >();

  for (const block of blocks) {
    const pageBlocks = pagesByNumber.get(block.page_number) ?? [];
    pageBlocks.push({
      block_id: block.block_id,
      text: block.text,
      bbox: block.bbox,
    });
    pagesByNumber.set(block.page_number, pageBlocks);
  }

  return [...pagesByNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page_number, pageBlocks]) => ({
      page_number,
      page_text: pageBlocks.map((block) => block.text).join("\n"),
      blocks: pageBlocks,
    }));
}

function buildEmptyMcqError(mode: ExtractionMode) {
  if (mode === "choices-provided") {
    return "No questions with four provided choices were found. Try “Make choices when missing” in Quiz Settings, or upload a file with A–D options.";
  }
  return "No questions were found in this file.";
}

function buildEmptyMcqHint(mode: ExtractionMode) {
  if (mode === "extract-and-generate") {
    return "The file may not contain multiple-choice questions, or they may be in an unusual format.";
  }
  if (mode === "choices-provided") {
    return "Switch extraction mode to “Make choices when missing” before uploading.";
  }
  return "Try another file with clearer question-and-answer content.";
}

async function applyGrammarFix(
  apiKey: string,
  result: PdfMcqResult,
  tracking?: TrackedOpenRouterContext,
): Promise<PdfMcqResult> {
  try {
    const fixedMcqs = await fixGrammarForMcqs(
      apiKey,
      result.mcqs.map((item, index) => ({
        ...item,
        questionNumber: item.questionNumber ?? index + 1,
        questionText: item.questionText ?? item.question ?? "",
        options: item.options ?? [],
      })),
      12,
      tracking,
    );
    return { ...result, mcqs: fixedMcqs };
  } catch {
    return result;
  }
}

function normalizeResult(result: PdfMcqResult): PdfMcqResult {
  return {
    title: result.title.trim() || "Extracted questions",
    summary: result.summary.trim(),
    mcqs: result.mcqs.map((item, index) => {
      const correctAnswer = (item.correctAnswer ?? "").trim();
      const hasSource = Boolean(item.sourceChunkIds?.length || item.sourcePage);

      return {
        questionId: item.questionId,
        questionNumber: item.questionNumber ?? index + 1,
        questionText: formatQuestionText(item.questionText ?? item.question ?? ""),
        options: (item.options ??
          item.choices?.map((choice, choiceIndex) => ({
            label: String.fromCharCode(65 + choiceIndex),
            text: formatOptionText(choice),
          })) ??
          []
        ).map((option) => ({
          label: option.label,
          text: formatOptionText(option.text),
        })),
        correctAnswer,
        answer: item.answer?.trim() || undefined,
        notes:
          item.notes ?? (item.explanation?.trim() ? [item.explanation.trim()] : []),
        imageIds: item.imageIds ?? [],
        imageUrls: item.imageUrls ?? [],
        rawJson: item.rawJson ?? item,
        status: item.status ?? (correctAnswer && hasSource ? "completed" : "needs_review"),
        sourceFile: item.sourceFile?.trim() || undefined,
        sourcePage: item.sourcePage,
        sourceRegion: normalizeMcqSourceRegion(item.sourceRegion, item.sourcePage),
        imageRegion: normalizeImageRegion(item.imageRegion),
        sourceChunkIds: item.sourceChunkIds?.length ? item.sourceChunkIds : undefined,
        sourcePagePreviewId: item.sourcePagePreviewId,
        sourcePageImageUrl: item.sourcePageImageUrl,
        sourcePageWidth: item.sourcePageWidth,
        sourcePageHeight: item.sourcePageHeight,
        exactQuote: item.exactQuote?.trim() || undefined,
      };
    }),
  };
}

function normalizeMcqSourceRegion(
  region: PdfMcq["sourceRegion"],
  sourcePage?: number,
): PdfMcq["sourceRegion"] | undefined {
  if (!region) return undefined;

  const normalized = normalizeHighlightSourceRegion(
    region as Parameters<typeof normalizeHighlightSourceRegion>[0],
    sourcePage ?? region.pageNumber ?? 1,
  );
  if (!normalized) return undefined;

  const x = clamp01(normalized.x);
  const y = clamp01(normalized.y);
  const width = clamp01(normalized.width);
  const height = clamp01(normalized.height);

  if (width < 0.05 || height < 0.05) return undefined;

  return {
    ...normalized,
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function buildSystemPrompt(_mode: ExtractionMode, _relaxed = false, repair = false): string {
  void _mode;
  void _relaxed;

  if (repair) {
    return "You are DrNote Extraction Engine. Fix the previous invalid response. Return only valid source-first JSON. No markdown.";
  }
  return `You are DrNote Extraction Engine.

Your job is to analyze parsed PDF text/OCR blocks and find study questions.

You must be source-first:
- Every extracted question must include the exact page number.
- Every extracted question must include the source block IDs used.
- Every extracted question must include a short exact source snippet copied from the input.
- Never invent a source.
- Never invent an answer unless the input clearly contains it.
- If the file has no real questions, say that questions were not found and set generation_needed true.

Definitions:
A real question may be a numbered exam-style question, a clinical vignette with answer options, a question ending with ?, a prompt like "Which of the following", a prompt like "What is the most appropriate", a stem followed by options A/B/C/D, or a recall-style question with "Answer:".

Do not count page numbers, headings, explanations, repeated duplicate copies of the same question, watermarks, Telegram links, captions, or random numbered lists that are not questions.

Duplicate handling:
If the same question appears twice, count it once. If one copy is from parsed text and another copy is from OCR/image text, keep the cleaner version but include both source block IDs if useful.

Return valid JSON only. No markdown.`;
}

function buildExtractionPrompt(mode: ExtractionMode, relaxed = false): string {
  const jsonShape =
    'Return compact JSON with this shape: {"title":"string","summary":"max 20 words","mcqs":[{"questionNumber":11,"questionText":"string","options":[{"label":"A","text":"string"}],"correctAnswer":"C","notes":["max one short source note"],"sourcePage":1,"sourceRegion":{"x":0.1,"y":0.2,"width":0.8,"height":0.15}}]}.';

  const formatHints =
    "Recognize multiple-choice questions in all formats: numbered stems, bullet-point scenarios (•), dash-prefixed lines (- or –), plain patient-scenario paragraphs, and options labeled A-D, A-C, A-B, a-d, or unlabeled lines. In student recall documents every bullet point is a question — do not skip bullets without numbered prefixes.";

  const shared =
    "Set title to a short, human-readable document name based on the content, not the uploaded filename. For each question, include sourcePage and sourceRegion when using full-file mode. Format questionText and option text in normal sentence case and fix obvious spelling typos while preserving medical meaning. " +
    "RECALL DOCUMENT RULES: (1) A short phrase immediately after a question in colored/underlined text is the ANSWER — put it in correctAnswer, not in questionText. (2) Remove author uncertainty notes like '(I don't remember the choices...)', '(not sure about...)', '(I think...)' from questionText — move them to notes. (3) Remove inline answer hints like '(answer: X)' from the stem — put X in correctAnswer. (4) Section headers (Non-Communicable Diseases, Communicable Diseases, Clinical Preventive Services, Maternal and Child Health, Environmental and Occupational, Epidemiology Biostatistics Demography, Management Quality Informatics) are NOT questions — skip them. (5) Explanation paragraphs and CDC/WHO/USPSTF citation blocks after an answer are NOT questions — use them as the explanation field. (6) If choices have no A/B/C/D labels, assign labels A, B, C, D in top-to-bottom order. (7) Preserve Arabic text in stems and choices — do not drop or truncate bilingual questions.";

  if (relaxed) {
    return `Extract every multiple-choice question you can find. ${formatHints} ${shared} ${jsonShape}`;
  }
  if (mode === "extract-and-generate") {
    return `Extract visible questions, then add additional study questions inspired by the same topics. ${formatHints} ${shared} ${jsonShape}`;
  }
  if (mode === "choices-provided") {
    return `Extract every visible question with four provided choices only. ${formatHints} ${shared} ${jsonShape}`;
  }
  if (mode === "make-choices") {
    return `Extract every visible question. Generate distractors when fewer than four choices exist. ${formatHints} ${shared} ${jsonShape}`;
  }
  return `Extract every visible question that already exists in the document. ${formatHints} ${shared} ${jsonShape}`;
}
