import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseOpenRouterUsage } from "../openrouter-usage.server.ts";
import {
  buildExtractionCacheKey,
  extractionCacheKeyId,
} from "../extraction-config.ts";

const libDir = path.join(import.meta.dirname, "..");
const appDir = path.join(import.meta.dirname, "../../app");
const convexDir = path.join(import.meta.dirname, "../../../convex");

describe("trackedOpenRouter records usage fields", () => {
  it("commits usage with userId, model, tokens, cost, and feature", () => {
    const src = readFileSync(path.join(libDir, "tracked-openrouter.server.ts"), "utf8");
    assert.match(src, /commitAiUsage\(\{/);
    assert.match(src, /clerkUserId: ctx\.clerkUserId/);
    assert.match(src, /feature: ctx\.feature/);
    assert.match(src, /model,/);
    assert.match(src, /promptTokens: usage\.promptTokens/);
    assert.match(src, /completionTokens: usage\.completionTokens/);
    assert.match(src, /totalTokens: usage\.totalTokens/);
    assert.match(src, /costUsd: usage\.costUsd/);
    assert.match(src, /status: "final"/);
  });

  it("accumulates extraction usage for per-file cost logs", () => {
    const tracked = readFileSync(path.join(libDir, "tracked-openrouter.server.ts"), "utf8");
    const extraction = readFileSync(path.join(libDir, "pdf-extraction.server.ts"), "utf8");

    assert.match(tracked, /usageAccumulator/);
    assert.match(tracked, /usageAccumulator\.promptTokens \+= usage\.promptTokens/);
    assert.match(tracked, /usageAccumulator\.completionTokens \+= usage\.completionTokens/);
    assert.match(tracked, /usageAccumulator\.totalTokens \+= usage\.totalTokens/);
    assert.match(tracked, /usageAccumulator\.costUsd \+= usage\.costUsd/);
    assert.match(extraction, /costPerPage/);
    assert.match(extraction, /costPerQuestion/);
    assert.match(extraction, /questionCount/);
  });

  it("parses OpenRouter usage from API payload", () => {
    const usage = parseOpenRouterUsage({
      id: "gen-1",
      usage: {
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
        cost: 0.004,
      },
    });

    assert.equal(usage.promptTokens, 120);
    assert.equal(usage.completionTokens, 80);
    assert.equal(usage.totalTokens, 200);
    assert.equal(usage.costUsd, 0.004);
    assert.equal(usage.generationId, "gen-1");
  });
});

describe("cache hit avoids OpenRouter", () => {
  const extractionSrc = readFileSync(
    path.join(libDir, "pdf-extraction.server.ts"),
    "utf8",
  );

  it("returns cached extraction before job creation and preflight", () => {
    const cacheLookup = extractionSrc.indexOf("const cached = await lookupExtractionCache");
    const cacheReturn = extractionSrc.indexOf("return returnCachedExtraction", cacheLookup);
    const createJob = extractionSrc.indexOf("const job = await createExtractionJob");
    const preflight = extractionSrc.indexOf("const preflight = await preflightTrackedAiCall");

    assert.ok(cacheLookup > -1);
    assert.ok(cacheReturn > cacheLookup);
    assert.ok(createJob > cacheReturn);
    assert.ok(preflight > createJob);
  });

  it("records zero-cost cache hit usage on cache return", () => {
    assert.match(extractionSrc, /void commitCacheHitUsage\(\{/);
    assert.match(extractionSrc, /feature: "extract"/);
  });
});

describe("quota exceeded avoids OpenRouter", () => {
  const extractionSrc = readFileSync(
    path.join(libDir, "pdf-extraction.server.ts"),
    "utf8",
  );
  const uploadClient = readFileSync(
    path.join(libDir, "process-pdf-upload.ts"),
    "utf8",
  );

  it("fails with quota_exceeded before openRouterCalled is set", () => {
    const preflightDeny = extractionSrc.indexOf('if (!preflight.allowed)');
    const quotaReason = extractionSrc.indexOf('reason: "quota_exceeded"', preflightDeny);
    const openRouterFlag = extractionSrc.indexOf("openRouterCalled = true");

    assert.ok(preflightDeny > -1);
    assert.ok(quotaReason > preflightDeny);
    assert.ok(quotaReason < openRouterFlag);
  });

  it("surfaces quota_exceeded through the async job status", () => {
    assert.match(uploadClient, /payload\.status === "failed"/);
    assert.match(uploadClient, /extractionErrorMessage\(payload\)/);
  });

  it("preflightTrackedAiCall surfaces denial without reservation", () => {
    const src = readFileSync(path.join(libDir, "tracked-openrouter.server.ts"), "utf8");
    assert.match(src, /if \(!result\.allowed\)/);
    assert.match(src, /allowed: false, reason: result\.reason/);
  });

  it("admin preflight bypasses quota checks before plan limits", () => {
    const src = readFileSync(path.join(convexDir, "usageLedger.ts"), "utf8");
    const adminBypass = src.indexOf("if (admin)");
    const budgetCheck = src.indexOf("projectedCost > limits.monthlyAiBudgetUsd");
    const fileSizeCheck = src.indexOf("args.fileSizeBytes && args.fileSizeBytes > limits.maxFileSizeBytes");
    const monthlyUploadCheck = src.indexOf("period.filesUploaded >= limits.monthlyFileLimit");

    assert.ok(adminBypass > -1);
    assert.ok(budgetCheck > adminBypass);
    assert.ok(fileSizeCheck > adminBypass);
    assert.ok(monthlyUploadCheck > adminBypass);
  });
});

describe("cache hit zero-cost policy", () => {
  it("commitCacheHitUsage writes cached true and costUsd 0", () => {
    const src = readFileSync(path.join(libDir, "convex-usage-client.server.ts"), "utf8");
    assert.match(src, /export async function commitCacheHitUsage/);
    assert.match(src, /promptTokens: 0/);
    assert.match(src, /completionTokens: 0/);
    assert.match(src, /totalTokens: 0/);
    assert.match(src, /costUsd: 0/);
    assert.match(src, /cached: true/);
    assert.match(src, /status: "final"/);
  });
});

describe("repeated upload safety", () => {
  const extractionSrc = readFileSync(
    path.join(libDir, "pdf-extraction.server.ts"),
    "utf8",
  );

  it("post-success repeat checks cache before any new OpenRouter path", () => {
    const cacheLookup = extractionSrc.indexOf("const cached = await lookupExtractionCache");
    const cacheReturn = extractionSrc.indexOf("return returnCachedExtraction", cacheLookup);
    const preflight = extractionSrc.indexOf("const preflight = await preflightTrackedAiCall");
    const openRouterCall = extractionSrc.indexOf("openRouterCalled = true");

    assert.ok(cacheLookup > -1);
    assert.ok(cacheReturn > cacheLookup);
    assert.ok(preflight > cacheReturn);
    assert.ok(openRouterCall > cacheReturn);
  });

  it("rapid duplicate upload waits on the distributed in-flight job", () => {
    const claim = extractionSrc.indexOf("const distributedClaim = await claimDistributedExtraction");
    const waiter = extractionSrc.indexOf("if (!distributedClaim.owner)", claim);
    const wait = extractionSrc.indexOf("return waitForDistributedExtraction", waiter);
    const ownerJob = extractionSrc.indexOf("const job = await createExtractionJob", wait);

    assert.ok(claim > -1);
    assert.ok(waiter > claim);
    assert.ok(wait > waiter);
    assert.ok(ownerJob > wait);
    assert.match(extractionSrc, /inFlightHit: true/);
    assert.match(extractionSrc, /duplicate_extraction_waiter/);
  });

  it("extraction version changes the cache key", () => {
    const current = buildExtractionCacheKey(
      "file-hash",
      "make-choices",
      "google/gemini-2.5-flash-lite",
    );
    const previous = { ...current, appExtractionVersion: "previous-version" };

    assert.notEqual(extractionCacheKeyId(current), extractionCacheKeyId(previous));
    assert.match(extractionCacheKeyId(current), /google\/gemini-2\.5-flash-lite/);
  });

  it("transient failure exits without writing a successful cache record", () => {
    const waitForDistributedExtraction = extractionSrc.indexOf(
      "async function waitForDistributedExtraction",
    );
    const unknownTransient = extractionSrc.indexOf(
      'buildFailureResponse("unknown_transient_error"',
      waitForDistributedExtraction,
    );
    const finalize = extractionSrc.indexOf("async function finalizeExtraction");
    const cacheWrite = extractionSrc.indexOf("await persistExtractionCache", finalize);

    assert.ok(waitForDistributedExtraction > -1);
    assert.ok(unknownTransient > waitForDistributedExtraction);
    assert.ok(finalize > unknownTransient);
    assert.ok(cacheWrite > finalize);
  });
});

describe("production storage and durable extraction records", () => {
  it("lookupExtractionCache asserts production storage before read", () => {
    const src = readFileSync(path.join(libDir, "extraction-cache.server.ts"), "utf8");
    assert.match(src, /assertProductionServerStorage\(\)/);
  });

  it("finalizeExtraction persists PdfExtractionRecord to Convex", () => {
    const src = readFileSync(path.join(libDir, "pdf-extraction.server.ts"), "utf8");
    assert.match(src, /await persistPdfExtractionRecord\(\{/);
    assert.match(src, /sourceChunks: args\.sourceChunks/);
  });

  it("ExtractionJobRecord tracks status lifecycle", () => {
    const src = readFileSync(path.join(libDir, "extraction-job-store.server.ts"), "utf8");
    assert.match(src, /"queued" \| "processing" \| "ready" \| "failed"/);
    assert.match(src, /syncJobToConvex/);
  });
});

describe("full-file fallback and OCR remain disabled by default", () => {
  it("documents disabled fallback env in extraction config", () => {
    const src = readFileSync(path.join(libDir, "extraction-config.ts"), "utf8");
    assert.match(src, /ENABLE_FULL_FILE_MULTIMODAL_FALLBACK/);
    assert.match(src, /ENABLE_PDF_OCR_ROUTE/);
  });

  it("ocr route checks isPdfOcrRouteEnabled before processing", () => {
    const src = readFileSync(path.join(appDir, "api/pdf/ocr/route.ts"), "utf8");
    assert.match(src, /isPdfOcrRouteEnabled/);
    assert.match(src, /403/);
  });
});
