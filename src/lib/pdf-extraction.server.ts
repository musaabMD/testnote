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
import { type PdfMcq, type PdfMcqResult } from "@/lib/pdf-mcqs";
import { extractSourceChunksFromPdf } from "@/lib/pdfjs-server.server";
import { mapChunkIdsToMcqRegions } from "@/lib/pdf-source-chunks.server";
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
  const estimatedQuestionCount =
    args.estimatedQuestionCount ?? Math.max(4, Math.min(24, args.pageCount * 4));
  return Math.min(args.configuredMaxTokens, estimatedQuestionCount * 220 + 500, 2500);
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
    pageCount,
    clerkUserId,
  } = args;
  const model = getOpenRouterModel("OPENROUTER_EXTRACTION_MODEL");
  const configuredMaxTokens = getOpenRouterMaxTokens("OPENROUTER_EXTRACTION_MAX_TOKENS", 2500);
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

    sourceChunks = await extractPdfChunksWithRetry({
      arrayBuffer,
      fileHash,
      probe,
    });
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
    const chunkExtraction = await runChunkBatchedExtraction({
      apiKey,
      model,
      maxTokens: dynamicExtractionMaxTokens({
        configuredMaxTokens,
        pageCount,
        estimatedQuestionCount: sourceChunks.length,
      }),
      repairModel,
      extractionMode,
      sourceChunks,
      jobId: job.id,
      trackingCtx,
      runCtx,
    });

    if (!("failureReason" in chunkExtraction) && chunkExtraction.mcqs.length > 0) {
      mapChunkIdsToMcqRegions(chunkExtraction.mcqs, sourceChunks);

      const normalized = normalizeResult(chunkExtraction);
      await recordPageExtractionAudits({
        jobId: job.id,
        fileHash,
        pageCount,
        sourceChunks,
        result: normalized,
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
        sourceChunks,
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
  const fullFileResult = await runFullFileExtraction({
    apiKey,
    model,
    maxTokens: dynamicExtractionMaxTokens({ configuredMaxTokens, pageCount }),
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

async function recordPageExtractionAudits(args: {
  jobId: string;
  fileHash: string;
  pageCount: number;
  sourceChunks: SourceChunk[];
  result: PdfMcqResult;
  retryCount: number;
}) {
  const chunksByPage = groupChunksByPage(args.sourceChunks);
  const mcqsByPage = groupMcqsByPage(args.result.mcqs, args.sourceChunks);

  for (let pageIndex = 0; pageIndex < args.pageCount; pageIndex += 1) {
    const pageNumber = pageIndex + 1;
    const chunks = chunksByPage.get(pageNumber) ?? [];
    const mcqs = mcqsByPage.get(pageNumber) ?? [];
    const candidateQuestionCount = chunks.filter((chunk) =>
      chunkLooksLikeQuestion(chunk.text),
    ).length;
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
      mode: candidateQuestionCount > 0 ? "existing_questions" : "noise",
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
      mode: candidateQuestionCount > 0 ? "existing_questions" : "noise",
      candidateQuestionCount,
      status: status === "partial" ? "needs_review" : "done",
    });
  }
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
    id: chunk.id,
    pageNumber: chunk.pageNumber,
    text: chunk.text,
  }));

  const body = JSON.stringify({
    model,
    temperature: 0,
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
  chunks: Array<{ id: string; pageNumber: number; text: string }>,
) {
  const jsonShape =
    'Return compact JSON with this shape: {"title":"string","summary":"max 20 words","mcqs":[{"questionNumber":11,"questionText":"string","options":[{"label":"A","text":"string"}],"correctAnswer":"C","notes":["max one short source note"],"sourceChunkIds":["chunk_id"],"exactQuote":"short quote from chunk"}]}.';

  const rules =
    "Create MCQ quiz questions from these source chunks. Process chunks in the exact order provided, page by page, and return one MCQ for every chunk that contains a question. Return JSON only. Each question must include sourceChunkIds (array of chunk ids from the provided list) and exactQuote (a short verbatim quote from the chunk). Do not invent sourceChunkIds — use only ids from the Chunks list. Do not include sourcePage or sourceRegion; coordinates are mapped from chunk ids on the server. Return only questions directly supported by the provided chunks.";

  const modeHint =
    mode === "make-choices" || relaxed
      ? "When choices are missing or fewer than four, generate plausible distractors."
      : "Extract only questions that already exist in the chunks.";

  return `${rules} ${modeHint} ${jsonShape}\n\nChunks:\n${JSON.stringify(chunks)}`;
}

function buildRepairChunkExtractionPrompt(
  mode: ExtractionMode,
  chunks: Array<{ id: string; pageNumber: number; text: string }>,
) {
  return `Your previous response was invalid JSON or did not match the required MCQ schema. Return ONLY valid JSON with keys title, summary, and mcqs (non-empty array). Each mcq needs questionNumber, questionText, options (at least 4), correctAnswer, sourceChunkIds, exactQuote. Mode: ${mode}.\n\nChunks:\n${JSON.stringify(chunks)}`;
}

function buildRepairExtractionPrompt(mode: ExtractionMode) {
  return `Your previous response was invalid JSON or did not match the required MCQ schema. Return ONLY valid JSON with keys title, summary, and mcqs (non-empty array). Each mcq needs questionNumber, questionText, options (at least 4), and correctAnswer. Mode: ${mode}.`;
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
    mcqs: result.mcqs.map((item, index) => ({
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
      correctAnswer: (item.correctAnswer ?? item.answer ?? "").trim(),
      notes:
        item.notes ?? (item.explanation?.trim() ? [item.explanation.trim()] : []),
      imageIds: item.imageIds ?? [],
      imageUrls: item.imageUrls ?? [],
      rawJson: item.rawJson ?? item,
      status: item.status ?? "completed",
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
    })),
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

function buildSystemPrompt(mode: ExtractionMode, relaxed = false, repair = false): string {
  if (repair) {
    return "Fix the previous invalid response. Return only valid JSON matching the required MCQ schema with a non-empty mcqs array. No markdown.";
  }
  if (relaxed) {
    return "You extract multiple-choice questions from educational PDF text chunks. When choices are missing or fewer than four, generate plausible distractors. Return only valid JSON with no markdown.";
  }
  if (mode === "extract-and-generate") {
    return "You extract questions from educational text chunks and may generate additional study questions inspired by the material. Return only valid JSON with no markdown.";
  }
  if (mode === "make-choices") {
    return "You extract questions from educational text chunks. When choices are missing or fewer than four, generate plausible distractors so each question has at least four options. Return only valid JSON with no markdown.";
  }
  return "You extract only questions that already exist in the provided text chunks. Do not invent questions. Return only valid JSON with no markdown.";
}

function buildExtractionPrompt(mode: ExtractionMode, relaxed = false): string {
  const jsonShape =
    'Return compact JSON with this shape: {"title":"string","summary":"max 20 words","mcqs":[{"questionNumber":11,"questionText":"string","options":[{"label":"A","text":"string"}],"correctAnswer":"C","notes":["max one short source note"],"sourcePage":1,"sourceRegion":{"x":0.1,"y":0.2,"width":0.8,"height":0.15}}]}.';

  const formatHints =
    "Recognize multiple-choice questions in common formats: numbered stems with options labeled A-D.";

  const shared =
    "For each question, include sourcePage and sourceRegion when using full-file mode. Format questionText and option text in normal sentence case and fix obvious spelling typos while preserving medical meaning.";

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
