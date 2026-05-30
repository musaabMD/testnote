import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  isFullFileMultimodalFallbackEnabled,
  isPdfOcrRouteEnabled,
  getMaxChunksPerBatch,
} from "../extraction-config.ts";
import { estimateExtractionCostUsd } from "../plan-limits.server.ts";
import {
  normalizeStripeBillingStatus,
  resolveStripePlan,
} from "../../../convex/stripePlanSync.ts";
import {
  assertProductionServerStorage,
  isConvexStorageConfigured,
  ServerConfigError,
} from "../server-storage.server.ts";
import {
  checkApiRateLimit,
  rateLimitExceededResponse,
  API_RATE_LIMITS,
  isConvexRateLimiterConfigured,
} from "../api-rate-limit.server.ts";
import { splitChunksIntoBatches } from "../chunk-batch.server.ts";
import type { SourceChunk } from "../highlightable-source.ts";

function makeChunk(id: string, text: string): SourceChunk {
  return {
    id,
    text,
    pageNumber: 1,
    region: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      pageNumber: 1,
      method: "pdf-layout",
      sourceKind: "question-block",
    },
  };
}

describe("extraction safety flags", () => {
  const envKeys = [
    "ENABLE_FULL_FILE_MULTIMODAL_FALLBACK",
    "ENABLE_PDF_OCR_ROUTE",
    "NODE_ENV",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("enables full-file multimodal fallback by default", () => {
    delete process.env.ENABLE_FULL_FILE_MULTIMODAL_FALLBACK;
    assert.equal(isFullFileMultimodalFallbackEnabled(), true);
  });

  it("allows disabling full-file multimodal fallback explicitly", () => {
    process.env.ENABLE_FULL_FILE_MULTIMODAL_FALLBACK = "false";
    assert.equal(isFullFileMultimodalFallbackEnabled(), false);
  });

  it("blocks OCR route in production unless explicitly enabled", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_PDF_OCR_ROUTE;
    assert.equal(isPdfOcrRouteEnabled(), false);

    process.env.ENABLE_PDF_OCR_ROUTE = "true";
    assert.equal(isPdfOcrRouteEnabled(), true);
  });

  it("allows OCR route in development by default", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_PDF_OCR_ROUTE;
    assert.equal(isPdfOcrRouteEnabled(), true);
  });
});

describe("production server storage", () => {
  const envKeys = ["NODE_ENV", "NEXT_PUBLIC_CONVEX_URL", "EXTRACTION_STORAGE_SECRET"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("requires Convex storage in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.EXTRACTION_STORAGE_SECRET;
    assert.equal(isConvexStorageConfigured(), false);
    assert.throws(() => assertProductionServerStorage(), ServerConfigError);
  });

  it("allows .data fallback in development without Convex", () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.EXTRACTION_STORAGE_SECRET;
    assert.doesNotThrow(() => assertProductionServerStorage());
  });
});

describe("rate limits", () => {
  const savedConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  afterEach(() => {
    if (savedConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
    else process.env.NEXT_PUBLIC_CONVEX_URL = savedConvexUrl;
  });

  it("returns 429 with Retry-After when bucket is exhausted", () => {
    const bucket = "pdfExtract" as const;
    const key = "test-user-rate-limit";

    for (let i = 0; i < API_RATE_LIMITS[bucket].capacity + 2; i++) {
      checkApiRateLimit(bucket, key);
    }

    const blocked = checkApiRateLimit(bucket, key);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds && blocked.retryAfterSeconds >= 1);

    const response = rateLimitExceededResponse(blocked.retryAfterSeconds!);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), String(blocked.retryAfterSeconds));
  });

  it("detects Convex Rate Limiter configuration", () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    assert.equal(isConvexRateLimiterConfigured(), false);

    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    assert.equal(isConvexRateLimiterConfigured(), true);
  });

  it("keeps static wiring for Convex distributed rate limits", () => {
    const nextLimiter = readFileSync(
      path.join(import.meta.dirname, "../api-rate-limit.server.ts"),
      "utf8",
    );
    const convexLimiter = readFileSync(
      path.join(import.meta.dirname, "../../../convex/apiRateLimits.ts"),
      "utf8",
    );

    assert.match(nextLimiter, /ConvexHttpClient/);
    assert.match(nextLimiter, /makeFunctionReference/);
    assert.match(nextLimiter, /apiRateLimits:enforceApiRateLimit/);
    assert.match(nextLimiter, /NEXT_PUBLIC_CONVEX_URL/);
    assert.match(convexLimiter, /rateLimiter\.limit/);
    assert.match(convexLimiter, /retryAfterMs/);
  });
});

describe("Stripe plan sync", () => {
  const envKeys = [
    "STRIPE_PRICE_PLAN_MAP",
    "STRIPE_FREE_PRICE_IDS",
    "STRIPE_STARTER_PRICE_IDS",
    "STRIPE_PRO_PRICE_IDS",
    "STRIPE_SCHOOL_PRICE_IDS",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) saved[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("resolves plan from Stripe metadata before env mappings", () => {
    process.env.STRIPE_PRICE_PLAN_MAP = JSON.stringify({ price_real: "starter" });
    assert.equal(
      resolveStripePlan({
        priceId: "price_real",
        metadata: { appPlan: "pro" },
      }),
      "pro",
    );
  });

  it("resolves plan from configured Stripe price IDs", () => {
    process.env.STRIPE_PRO_PRICE_IDS = "price_pro_monthly,price_pro_yearly";
    assert.equal(resolveStripePlan({ priceId: "price_pro_yearly" }), "pro");
  });

  it("maps Stripe billing statuses to Convex billing statuses", () => {
    assert.equal(normalizeStripeBillingStatus("trialing"), "trialing");
    assert.equal(normalizeStripeBillingStatus("active"), "active");
    assert.equal(normalizeStripeBillingStatus("past_due"), "past_due");
    assert.equal(normalizeStripeBillingStatus("canceled"), "canceled");
    assert.equal(normalizeStripeBillingStatus("incomplete"), "none");
  });
});

describe("chunk batching for large PDFs", () => {
  it("splits many chunks into multiple batches", () => {
    const maxChunks = getMaxChunksPerBatch();
    const chunks = Array.from({ length: maxChunks + 5 }, (_, i) =>
      makeChunk(`chunk-${i}`, `Question ${i} text`),
    );

    const batches = splitChunksIntoBatches(chunks);
    assert.ok(batches.length >= 2);
    assert.ok(batches.every((batch) => batch.chunks.length <= maxChunks));
    assert.equal(
      batches.reduce((sum, batch) => sum + batch.chunks.length, 0),
      chunks.length,
    );
  });
});

describe("extraction cost guardrails", () => {
  it("estimates Flash-Lite cheaper than Flash for the same file", () => {
    const flashLite = estimateExtractionCostUsd({
      pageCount: 3,
      batchCount: 1,
      model: "google/gemini-2.5-flash-lite",
    });
    const flash = estimateExtractionCostUsd({
      pageCount: 3,
      batchCount: 1,
      model: "google/gemini-2.5-flash",
    });

    assert.ok(flashLite < flash);
    assert.ok(flashLite < 0.01);
  });

  it("keeps Convex cost estimates aligned with Flash-Lite extraction default", () => {
    const convexPlanLimits = readFileSync(
      path.join(import.meta.dirname, "../../../convex/planLimits.ts"),
      "utf8",
    );

    assert.match(convexPlanLimits, /flash-lite/);
    assert.match(convexPlanLimits, /0\.0008/);
  });

  it("keeps static hooks for single-flight and model cost comparison logging", () => {
    const src = readFileSync(path.join(import.meta.dirname, "../pdf-extraction.server.ts"), "utf8");
    assert.match(src, /inFlightExtractions/);
    assert.match(src, /inFlightHit: true/);
    assert.match(src, /claimDistributedExtraction/);
    assert.match(src, /waitForDistributedExtraction/);
    assert.match(src, /pdf-extraction-model-cost-comparison/);
    assert.match(src, /pdf-extraction-cost-guard/);
  });
});

describe("documentation and backlog", () => {
  const root = path.join(import.meta.dirname, "../../..");

  it("includes Production Architecture Gaps with Trigger.dev and R2", () => {
    const backlog = readFileSync(path.join(root, "docs/BACKLOG.md"), "utf8");
    assert.match(backlog, /Production Architecture Gaps/);
    assert.match(backlog, /Readiness snapshot/);
    assert.match(backlog, /B-01.*Trigger\.dev/);
    assert.match(backlog, /B-02.*Cloudflare R2/);
    assert.match(backlog, /B-06.*Ask retrieval/);
    assert.match(backlog, /B-08.*Admin cost dashboard/);
  });

  it("includes Convex components review doc", () => {
    const reviewPath = path.join(root, "docs/CONVEX-COMPONENTS-REVIEW.md");
    assert.equal(existsSync(reviewPath), true);
    const review = readFileSync(reviewPath, "utf8");
    assert.match(review, /Rate Limiter/);
    assert.match(review, /Cloudflare R2/);
  });

  it("documents cache hit zero-cost policy", () => {
    const policy = readFileSync(path.join(root, "docs/USAGE-LEDGER-POLICY.md"), "utf8");
    assert.match(policy, /cached:\s*true/);
    assert.match(policy, /costUsd:\s*0/);
  });

  it("documents pricing boundary and keeps quota schema fields present", () => {
    const backlog = readFileSync(path.join(root, "docs/BACKLOG.md"), "utf8");
    const architecture = readFileSync(path.join(root, "docs/AI-STACK-ARCHITECTURE.md"), "utf8");
    const schema = readFileSync(path.join(root, "convex/schema.ts"), "utf8");

    assert.match(backlog, /Do not use sample launch-checklist pricing/);
    assert.match(architecture, /Do not copy sample pricing/);
    assert.match(schema, /monthlyFileLimit/);
    assert.match(schema, /monthlyChatLimit/);
    assert.match(schema, /activeJobLimit/);
    assert.match(schema, /maxPagesPerFile/);
    assert.match(schema, /maxFileSizeBytes/);
  });

  it("keeps dashboard usage visibility wired to current period usage", () => {
    const dashboardStats = readFileSync(
      path.join(root, "src/components/dashboard/dashboard-stats.tsx"),
      "utf8",
    );
    const users = readFileSync(path.join(root, "convex/users.ts"), "utf8");

    assert.match(dashboardStats, /api\.users\.getMyUsageDashboard/);
    assert.match(users, /usagePeriods/);
    assert.match(users, /creditsUsedFromUsage/);
    assert.match(users, /filesUploaded: period\?\.filesUploaded/);
    assert.match(users, /pagesProcessed: period\?\.pagesProcessed/);
    assert.match(users, /chatMessages: period\?\.chatMessages/);
  });

  it("keeps durable extraction worker recovery wired", () => {
    const schema = readFileSync(path.join(root, "convex/schema.ts"), "utf8");
    const extractionStorage = readFileSync(
      path.join(root, "convex/extractionStorage.ts"),
      "utf8",
    );
    const workerRoute = readFileSync(
      path.join(root, "src/app/api/pdf/mcqs/worker/route.ts"),
      "utf8",
    );
    const crons = readFileSync(path.join(root, "convex/crons.ts"), "utf8");

    assert.match(schema, /by_status_updated/);
    assert.match(extractionStorage, /claimNextWorkerExtractionJob/);
    assert.match(extractionStorage, /getActiveExtractionJobForUpload/);
    assert.match(extractionStorage, /STALE_JOB_RECOVERY_BATCH_SIZE/);
    assert.match(extractionStorage, /\.eq\("status", "processing"\)\.lt\("updatedAt", cutoff\)/);
    assert.doesNotMatch(extractionStorage, /ctx\.db\.query\("extractionJobs"\)\.collect\(\)/);
    assert.match(workerRoute, /CRON_SECRET/);
    assert.match(workerRoute, /claimNextWorkerExtractionJob/);
    assert.match(workerRoute, /getConvexSourceFileUrl/);
    assert.match(workerRoute, /runPdfMcqExtraction/);
    assert.match(crons, /runExtractionWorker/);
    assert.match(crons, /EXTRACTION_WORKER_URL/);
    assert.match(crons, /internal\.crons\.runExtractionWorker/);
  });

  it("launches queued upload extraction through a durable worker after the response", () => {
    const mcqsRoute = readFileSync(
      path.join(root, "src/app/api/pdf/mcqs/route.ts"),
      "utf8",
    );

    assert.match(mcqsRoute, /from "next\/server"/);
    assert.match(mcqsRoute, /\bafter\s*\(/);
    assert.match(mcqsRoute, /sourceStored/);
    assert.match(mcqsRoute, /triggerExtractionWorker/);
    assert.match(mcqsRoute, /claimQueuedExtractionJobForUpload/);
    assert.match(mcqsRoute, /inFlightHit:\s*true/);
    assert.match(mcqsRoute, /\/api\/pdf\/mcqs\/worker/);
  });

  it("keeps hard limit enforcement hooks in Convex quota preflight", () => {
    const usageLedger = readFileSync(path.join(root, "convex/usageLedger.ts"), "utf8");
    const usageClient = readFileSync(
      path.join(root, "src/lib/convex-usage-client.server.ts"),
      "utf8",
    );
    const mcqsRoute = readFileSync(
      path.join(root, "src/app/api/pdf/mcqs/route.ts"),
      "utf8",
    );

    assert.match(usageLedger, /fileSizeBytes/);
    assert.match(usageLedger, /maxFileSizeBytes/);
    assert.match(usageLedger, /maxPagesPerFile/);
    assert.match(usageLedger, /monthlyChatLimit/);
    assert.match(usageLedger, /totalTokens/);
    assert.match(usageClient, /fileSizeBytes/);
    assert.match(mcqsRoute, /MAX_SERVER_UPLOAD_BYTES/);
    assert.doesNotMatch(mcqsRoute, /20 MB/);
  });

  it("keeps Next proxy body buffering aligned with server upload limits", () => {
    const nextConfig = readFileSync(path.join(root, "next.config.ts"), "utf8");
    const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
    const readme = readFileSync(path.join(root, "README.md"), "utf8");

    assert.match(nextConfig, /proxyClientMaxBodySize/);
    assert.match(nextConfig, /NEXT_PROXY_CLIENT_MAX_BODY_SIZE/);
    assert.match(envExample, /MAX_SERVER_UPLOAD_BYTES=524288000/);
    assert.match(envExample, /NEXT_PROXY_CLIENT_MAX_BODY_SIZE=500mb/);
    assert.match(readme, /NEXT_PROXY_CLIENT_MAX_BODY_SIZE=500mb/);
  });

  it("keeps R2 source-file persistence wired", () => {
    const schema = readFileSync(path.join(root, "convex/schema.ts"), "utf8");
    const sourceFiles = readFileSync(path.join(root, "convex/sourceFiles.ts"), "utf8");
    const sourceFileClient = readFileSync(
      path.join(root, "src/lib/convex-source-file.client.ts"),
      "utf8",
    );
    const envExample = readFileSync(path.join(root, ".env.example"), "utf8");

    assert.match(schema, /r2Key/);
    assert.match(schema, /storageProvider/);
    assert.match(sourceFiles, /r2\.store/);
    assert.match(sourceFiles, /commitR2SourceFile/);
    assert.match(sourceFiles, /r2\.getUrl/);
    assert.match(sourceFiles, /generateR2SourceUploadUrl/);
    assert.match(sourceFiles, /r2\.generateUploadUrl/);
    assert.match(sourceFileClient, /api\.sourceFiles\.generateR2SourceUploadUrl/);
    assert.match(sourceFileClient, /method: "PUT"/);
    assert.match(sourceFileClient, /api\.r2\.syncMetadata/);
    assert.match(envExample, /R2_BUCKET=drnote-uploads-prod/);
    assert.match(envExample, /R2_ENDPOINT=https:\/\/5000e0a4f0ca6dd90b08bde9dc11ccb9\.r2\.cloudflarestorage\.com/);
  });

  it("keeps R2 source-page preview persistence wired", () => {
    const schema = readFileSync(path.join(root, "convex/schema.ts"), "utf8");
    const extractionStorage = readFileSync(
      path.join(root, "convex/extractionStorage.ts"),
      "utf8",
    );
    const sourcePreviewStore = readFileSync(
      path.join(root, "src/lib/source-preview-store.server.ts"),
      "utf8",
    );

    assert.match(schema, /previewR2Key/);
    assert.match(schema, /previewMimeType/);
    assert.match(extractionStorage, /storeQuestionSourcePreview/);
    assert.match(extractionStorage, /sourcePreviewR2Key/);
    assert.match(extractionStorage, /r2\.store/);
    assert.match(extractionStorage, /r2\.getUrl/);
    assert.match(sourcePreviewStore, /\.webp\(\{ quality: 82 \}\)/);
    assert.match(sourcePreviewStore, /storePreviewImageInConvex/);
    assert.match(sourcePreviewStore, /sourcePageImageUrl: storedPreview\.imageUrl/);
  });

  it("keeps large extraction payloads out of Convex documents", () => {
    const schema = readFileSync(path.join(root, "convex/schema.ts"), "utf8");
    const extractionStorage = readFileSync(
      path.join(root, "convex/extractionStorage.ts"),
      "utf8",
    );
    const extractionCache = readFileSync(
      path.join(root, "src/lib/extraction-cache.server.ts"),
      "utf8",
    );
    const extractionJobs = readFileSync(
      path.join(root, "src/lib/extraction-job-store.server.ts"),
      "utf8",
    );

    assert.match(schema, /payloadR2Key/);
    assert.match(extractionStorage, /upsertFileCachePayload/);
    assert.match(extractionStorage, /upsertPdfExtractionPayload/);
    assert.match(extractionCache, /CONVEX_DOCUMENT_SAFE_BYTES/);
    assert.match(extractionJobs, /CONVEX_DOCUMENT_SAFE_BYTES/);
  });

  it("does not auto-retry a failed homepage upload batch", () => {
    const dropzone = readFileSync(
      path.join(root, "src/components/pdf/pdf-dropzone.tsx"),
      "utf8",
    );

    assert.doesNotMatch(
      dropzone,
      /catch \(uploadError\) \{[\s\S]{0,260}lastBatchRef\.current = ""/,
    );
    assert.match(dropzone, /const startProcessing = \(\) => \{[\s\S]{0,160}lastBatchRef\.current = ""/);
  });

  it("asks signed-out users to sign up before homepage upload extraction", () => {
    const dropzone = readFileSync(
      path.join(root, "src/components/pdf/pdf-dropzone.tsx"),
      "utf8",
    );

    assert.match(dropzone, /useClerk/);
    assert.match(dropzone, /openSignUp/);
    assert.match(dropzone, /const requestSignUpForUpload = useCallback/);
    assert.match(dropzone, /if \(requestSignUpForUpload\(\)\) return/);
    assert.match(dropzone, /fallbackRedirectUrl: DASHBOARD_REDIRECT/);
    assert.doesNotMatch(
      dropzone,
      /const addFiles = useCallback\([\s\S]{0,180}setFiles/,
      "addFiles must not queue files before the sign-up gate runs",
    );
  });

  it("keeps upload progress persistent and avoids raw non-ascii multipart filenames", () => {
    const uploadClient = readFileSync(
      path.join(root, "src/lib/process-pdf-upload.ts"),
      "utf8",
    );
    const providers = readFileSync(
      path.join(root, "src/components/providers.tsx"),
      "utf8",
    );
    const mcqsRoute = readFileSync(
      path.join(root, "src/app/api/pdf/mcqs/route.ts"),
      "utf8",
    );

    assert.match(uploadClient, /safeMultipartFileName/);
    assert.match(uploadClient, /formData\.append\("file", file, safeMultipartFileName\(file\)\)/);
    assert.match(uploadClient, /formData\.append\("fileName", file\.name\)/);
    assert.match(uploadClient, /upsertUploadProgressRecord/);
    assert.match(uploadClient, /resumePersistedExtractionJob/);
    assert.match(providers, /<UploadProgressToast \/>/);
    assert.match(mcqsRoute, /displayFileName/);
    assert.match(mcqsRoute, /fileName:\s*(?:displayFileName|upload\.displayFileName)/);
  });

  it("keeps Stripe webhook to Convex plan sync wiring", () => {
    const http = readFileSync(path.join(root, "convex/http.ts"), "utf8");
    const billing = readFileSync(path.join(root, "convex/billing.ts"), "utf8");
    const usageLedger = readFileSync(path.join(root, "convex/usageLedger.ts"), "utf8");

    assert.match(http, /checkout\.session\.completed/);
    assert.match(http, /customer\.subscription\.updated/);
    assert.match(http, /customer\.subscription\.deleted/);
    assert.match(http, /invoice\.payment_failed/);
    assert.match(http, /setUserPlanByClerkId/);
    assert.match(http, /resolveStripePlan/);
    assert.match(http, /past_due/);
    assert.match(billing, /subscriptionMetadata: \{ userId: identity\.subject, priceId: args\.priceId \}/);
    assert.match(usageLedger, /activeExtractionLimit/);
  });

  it("keeps public pricing copy within Convex plan limits", () => {
    const pricing = readFileSync(
      path.join(root, "src/components/pricing-plans.tsx"),
      "utf8",
    );
    const planLimits = readFileSync(path.join(root, "convex/planLimits.ts"), "utf8");
    const clerkBilling = readFileSync(
      path.join(root, "src/lib/clerk-billing.server.ts"),
      "utf8",
    );
    const envExample = readFileSync(path.join(root, ".env.example"), "utf8");

    assert.match(pricing, /slug: "pro"/);
    assert.match(pricing, /value: "10k"/);
    assert.match(pricing, /value: "100"/);
    assert.match(pricing, /value: "500"/);
    assert.match(pricing, /Up to 250 MB per file/);
    assert.match(planLimits, /monthlyPageLimit: 10_000/);
    assert.match(planLimits, /monthlyFileLimit: 100/);
    assert.match(planLimits, /chatMessagesPerDay: 500/);
    assert.match(planLimits, /maxFileSizeBytes: 250 \* 1024 \* 1024/);

    assert.match(pricing, /slug: "max"/);
    assert.match(pricing, /value: "100k"/);
    assert.match(pricing, /value: "500"/);
    assert.match(pricing, /value: "2k"/);
    assert.match(pricing, /Up to 500 MB per file/);
    assert.match(planLimits, /monthlyPageLimit: 100_000/);
    assert.match(planLimits, /monthlyFileLimit: 500/);
    assert.match(planLimits, /chatMessagesPerDay: 2000/);
    assert.match(planLimits, /maxFileSizeBytes: 500 \* 1024 \* 1024/);

    assert.match(clerkBilling, /CLERK_BILLING_MAX_PLAN/);
    assert.match(clerkBilling, /convexPlan: "school"/);
    assert.match(envExample, /CLERK_BILLING_PRO_PLAN=pro/);
    assert.match(envExample, /CLERK_BILLING_MAX_PLAN=max/);
    assert.match(envExample, /CLERK_BILLING_STARTER_PLAN=starter/);
  });

  it("keeps internal cost report wiring", () => {
    const usageLedger = readFileSync(path.join(root, "convex/usageLedger.ts"), "utf8");
    const reportScript = readFileSync(
      path.join(root, "scripts/internal-cost-report.mts"),
      "utf8",
    );
    const packageJson = readFileSync(path.join(root, "package.json"), "utf8");

    assert.match(usageLedger, /getInternalCostReport/);
    assert.match(usageLedger, /PLAN_REVENUE_USD_MAP/);
    assert.match(usageLedger, /duplicateChargedFiles/);
    assert.match(usageLedger, /lowMarginUsers/);
    assert.match(reportScript, /api\.usageLedger\.getInternalCostReport/);
    assert.match(packageJson, /report:cost/);
  });

  it("keeps distributed extraction lock wiring", () => {
    const schema = readFileSync(path.join(root, "convex/schema.ts"), "utf8");
    const storage = readFileSync(path.join(root, "convex/extractionStorage.ts"), "utf8");
    const lock = readFileSync(
      path.join(root, "src/lib/distributed-extraction-lock.server.ts"),
      "utf8",
    );
    const extraction = readFileSync(
      path.join(root, "src/lib/pdf-extraction.server.ts"),
      "utf8",
    );
    const jobs = readFileSync(
      path.join(root, "src/lib/extraction-job-store.server.ts"),
      "utf8",
    );

    assert.match(schema, /by_extraction_key/);
    assert.match(storage, /claimExtractionJob/);
    assert.match(storage, /retryCooldownMs/);
    assert.match(storage, /isPermanentFailure/);
    assert.match(storage, /existing\.jobId === args\.jobId/);
    assert.match(storage, /failedBecauseSameJobWasProcessing/);
    assert.match(lock, /claimDistributedExtraction/);
    assert.match(extraction, /EXTRACTION_LOCK_WAIT_MS/);
    assert.match(jobs, /getExtractionJobById/);
  });
});

describe("trackedOpenRouter wiring (static check)", () => {
  it("routes import tracked OpenRouter helpers", () => {
    const mcqs = readFileSync(
      path.join(import.meta.dirname, "../../app/api/pdf/mcqs/route.ts"),
      "utf8",
    );
    const mcqsWorker = readFileSync(
      path.join(import.meta.dirname, "../../app/api/pdf/mcqs/worker/route.ts"),
      "utf8",
    );
    const grammar = readFileSync(
      path.join(import.meta.dirname, "../../app/api/pdf/fix-grammar/route.ts"),
      "utf8",
    );
    const ocr = readFileSync(
      path.join(import.meta.dirname, "../../app/api/pdf/ocr/route.ts"),
      "utf8",
    );
    const chat = readFileSync(
      path.join(import.meta.dirname, "../../app/api/chat/route.ts"),
      "utf8",
    );

    assert.match(mcqs, /preflightTrackedAiCall/);
    assert.match(mcqs, /triggerExtractionWorker/);
    assert.match(mcqsWorker, /runPdfMcqExtraction/);
    assert.match(grammar, /preflightTrackedAiCall/);
    assert.match(grammar, /fixGrammarItems/);
    assert.match(ocr, /trackedOpenRouterFetch/);
    assert.match(chat, /preflightTrackedAiCall/);
    assert.match(chat, /commitTrackedChatUsage/);
  });
});
