# TestNote Engineering Backlog

> Prioritized work items. **Interim = what runs today for testing.** **Target = production architecture (Option 1).**
> No UI redesign required for any item unless noted.

---

## Readiness snapshot (May 2026)

After this pass, the split is:

| Area | Production-ready now | Interim for testing | Target later |
|------|---------------------|---------------------|--------------|
| Usage ledger + `trackedOpenRouter` | ✅ All OpenRouter paths | — | — |
| Quota preflight/reservations | ✅ When env enabled | Off by default in dev | Verify Clerk Billing plan mapping before sale |
| Extraction cache by file hash | ✅ Convex + dev `.data` | `.data` dev only | — |
| Production storage guard | ✅ 503 without Convex in prod | `.data` allowed in dev | — |
| Full-file multimodal fallback | ✅ Disabled by default | Opt-in env only | Premium opt-in |
| OCR in upload pipeline | ✅ Not called | `/api/pdf/ocr` dev/manual | — |
| Rate limits | 🟡 Convex-backed when configured | In-memory fallback for local testing | Keep Convex Rate Limiter required before production |
| Background extraction | ❌ Sync API | Job records written | Trigger.dev (B-01) |
| Durable file bytes | ✅ R2 for source originals | IndexedDB optional local cache | R2 source preview images (B-07) |
| Server page previews | 🟡 Partial | question source payload + generated previews in progress | R2 + signed image URLs (B-07) |
| Ask retrieval | ❌ First 24 questions | — | RAG (B-06) |
| Internal cost controls | 🟡 CLI/report + audit events | Convex table viewer + `npm run report:cost` | B-08 + B-11 |

**Custom code we keep:** fileHash extraction cache, chunk batching, `trackedOpenRouter`, pdf-layout source regions, in-memory rate limits (until B-04).

**Convex components we will use now:** usage ledger tables/custom mutations and Rate Limiter (B-04).

**Convex components we will use later:** RAG (B-06), R2 (B-02/B-07), Action Retrier/custom idempotent retry. Pick Trigger.dev or Convex Workflow/Workpool for jobs, not both.

---

## Master Status Checklist

Use this section first when resuming work.

### Pricing Boundary

```txt
[x] Do not use sample launch-checklist pricing as product pricing.
[x] Public pricing remains owned by Clerk Billing.
[x] Convex limit fields exist for backend enforcement and must be reconciled to real pricing before paid launch.
[x] Revenue/cost margin checks are internal-only and must never appear in public UI or user-facing copy.
```

### Done

```txt
[x] File hash extraction cache exists.
[x] Cache key includes fileHash, extractionMode, extractionModel, appExtractionVersion.
[x] Cache hit avoids OpenRouter and records zero-cost usage event when quota enforcement is enabled.
[x] trackedOpenRouter is wired for extraction, chat, grammar, and OCR route when enabled.
[x] Convex usage ledger tables exist: usagePeriods, aiUsageEvents, quotaReservations.
[x] Convex users table includes internal quota fields for monthly AI, page, file, chat, active job, file-size, and per-file page limits.
[x] Quota preflight/reservation flow exists when QUOTA_ENFORCEMENT_ENABLED=true.
[x] Production storage guard prevents silent .data usage without Convex.
[x] Full-file multimodal fallback is disabled by default.
[x] OCR is not part of normal upload extraction.
[x] Grammar auto-fix is disabled by default.
[x] Chunk batching exists for large PDFs.
[x] Extraction failure reasons separate PDF text/probe/model/schema/quota failures.
[x] Default env ladder documents Flash-Lite for extraction and Flash for repair/chat.
[x] Extraction repair calls use OPENROUTER_EXTRACTION_REPAIR_MODEL.
[x] In-process single-flight dedupe exists for rapid duplicate uploads on the same server instance.
[x] Stable extraction cache-key logging exists.
[x] Dynamic extraction max_tokens cap exists.
[x] Internal extraction usage accumulator logs promptTokens, completionTokens, totalTokens, costUsd, costPerPage, costPerQuestion.
[x] Dev model-cost comparison log exists for current model vs Flash-Lite.
[x] Source question payload endpoint exists.
[x] Source modal can consume questionId source payload without normal /api/pdf/page-preview polling.
[x] Convex component decision doc exists.
[x] Full production build passes.
[x] Full app typecheck passes after excluding test/manual scripts from production tsconfig.
[x] Persisted `appAuditEvents` exist for quota blocks, rate limits, duplicate extraction owners/waiters, and source failure signals.
[x] Production verification docs exist for Clerk Billing to Convex, source browser QA, and OpenRouter safety gates.
[x] Deployed duplicate extraction smoke script exists: `npm run test:deployed-duplicate-extraction`.
```

### Partial / Needs Hardening

```txt
[~] Source previews generate server-side payloads, but durable R2 image storage is not complete.
[~] Source modal reliability is improved and source QA unit suite passes, but end-to-end browser QA with real PDFs still needed.
[~] Distributed extraction claim exists in Convex; needs deployed concurrency verification across Vercel instances.
[~] Rate limits use Convex Rate Limiter when `NEXT_PUBLIC_CONVEX_URL` is configured; local memory fallback remains for dev.
[~] Quota enforcement checks monthly AI/page/file/chat, active jobs, max pages/file, and max file size when enabled; deployed verification still needed.
[~] Convex plan limit values exist and Clerk Billing plan sync is wired, but plan slugs/visible limits must be reconciled with real product pricing before first paid sale.
[x] Cost logs include per-extraction actual usage and internal Convex cost report query/CLI exists.
[~] Suspicious-cost guard warns only; hard block thresholds still need calibration.
[x] Admin/internal cost reporting exists as CLI/Convex query and includes persisted quota/rate/source/duplicate audit counts.
[~] Clerk Billing plan sync is wired; needs real staging plan lifecycle verification.
[~] Convex/R2 stubs exist but file bytes and preview images are not durably stored.
[~] Background job records exist but extraction is still synchronous.
```

### Not Done / Pending

```txt
[x] Convex Rate Limiter bridge exists for /api/pdf/mcqs.
[x] Convex Rate Limiter bridge exists for /api/chat.
[x] Convex Rate Limiter bridge exists for /api/pdf/fix-grammar.
[x] Convex Rate Limiter bridge exists for /api/pdf/ocr.
[x] Distributed extraction single-flight lock by extractionKey.
[x] Active extraction limit by plan.
[x] Monthly page limit enforcement in Convex preflight.
[x] Monthly file upload limit enforcement in Convex preflight.
[x] Daily/monthly chat limit enforcement in Convex preflight.
[x] Max pages per file enforcement from Convex plan limits.
[x] Max file size enforcement from Convex plan limits.
[~] Route has a server-wide upload byte cap via `MAX_SERVER_UPLOAD_BYTES`; plan-specific cap is enforced by Convex quota.
[ ] Budget warning events at 75% and 90%.
[ ] Suspicious extraction cost hard block after calibration.
[x] Per-file cost log with promptTokens, completionTokens, totalTokens, costUsd, costPerPage, costPerQuestion.
[x] Dev model-cost comparison log: current model vs Flash-Lite savings.
[~] Repeated-upload local/static checks exist; deployed duplicate smoke script added, staging OpenRouter verification still required.
[ ] Trigger.dev extraction worker or Convex Workflow/Workpool decision.
[ ] Upload creates background job and same screen polls status.
[x] R2 original file storage.
[ ] R2 source page preview image storage.
[ ] Convex metadata for original files, converted PDFs, previews, and source artifacts.
[ ] Ask mode retrieval over source chunks using Convex RAG or custom retrieval.
[x] Clerk Billing sync updates Convex plan and billingStatus.
[x] Internal admin/report for user spend, plan value, and low-margin accounts.
[ ] Reconcile Convex plan names/limits with Clerk Billing public pricing and plan slugs.
[ ] DOCX/PPTX server conversion or clear rejection.
```

### Blocked / Deliberately Later

```txt
[ ] R2 production storage depends on choosing bucket/env setup.
[ ] Trigger.dev worker depends on choosing Trigger.dev vs Convex Workflow/Workpool.
[ ] Stripe plan sync depends on real webhook deployment/config and price ID mapping verification.
[ ] Ask RAG depends on source chunk persistence and retrieval data shape.
[ ] Aggregate/Sharded Counter deferred until usage event volume requires faster totals.
[ ] Public admin UI intentionally deferred; internal logs/Convex table viewer first.
```

### Integration Status

| Integration | Status | Use now? | Notes |
|-------------|--------|----------|-------|
| Clerk | Partial/done | Yes | Identity source; every paid route should resolve Clerk user or constrained anon fallback |
| Convex usage ledger | Done/partial | Yes | Tables, tracked usage, quota preflight, and audit event persistence exist; staging verification still needed |
| Convex Rate Limiter | Done/partial | Yes | Next API bridge added; uses Convex when configured and local fallback in dev |
| Convex Action Cache | Not now | No | Keep custom fileHash cache for extraction |
| Convex Workflow/Workpool | Pending decision | Later | Use only if not choosing Trigger.dev |
| Convex Action Retrier | Pending | Later/soon | Only for idempotent, reservation-aware retries |
| Convex RAG | Pending | Later | Ask mode retrieval over chunks |
| Convex R2 / Cloudflare R2 | Pending | Later/target | Originals, converted PDFs, source preview images |
| Clerk Billing to Convex | Done/partial | Yes | Request-time plan sync is wired; real Clerk plan slug and visible-limit verification still required; see `CLERK-CONVEX-VERIFICATION.md` |
| PostHog | Optional | Later | Product analytics, not cost ledger |
| Aggregate/Sharded Counter | Not installed/deferred | Later | Only if usagePeriods becomes too slow |
| OpenRouter | Done/partial | Yes | Actual model usage/cost provider only |
| Trigger.dev | Pending decision | Later | Preferred external background extraction target unless Convex Workflow is chosen |

---

## Production Architecture Gaps

Each item labels what is temporary vs production-ready. See also [`CONVEX-COMPONENTS-REVIEW.md`](./CONVEX-COMPONENTS-REVIEW.md).

| ID | Item | Status | Current implementation | Target implementation | Risk if not done | Priority |
|----|------|--------|------------------------|----------------------|------------------|----------|
| **B-01** | Trigger.dev background extraction | **interim** | Sync `/api/pdf/mcqs`; `ExtractionJob` records in Convex + optional `.data` in dev | Upload enqueues job → Trigger.dev worker runs same extraction engine → UI polls job status (same screens) | Timeouts on large PDFs; poor UX; serverless memory limits | **P1** |
| **B-02** | Cloudflare R2 durable file storage | **interim** | IndexedDB browser cache; `.data` local dev only; Convex metadata/results | R2 stores originals, converted PDFs, page previews, source artifacts | Files lost on device change; no server reprocessing | **P1** |
| **B-03** | Clerk Billing → Convex plan sync | **partial** | Request-time Clerk Billing plan checks sync to `setUserPlanByClerkId`; `max`/`teams` currently map to `school` | Verify real Clerk plan slugs and visible limits before first sale | Paid users stay on free quotas or unpaid users keep paid quotas | **P1** |
| **B-04** | Production distributed rate limits | **partial** | Convex Rate Limiter bridge exists for `/api/pdf/mcqs`, `/api/chat`, `/api/pdf/fix-grammar`, `/api/pdf/ocr`; in-memory fallback remains for local dev | Require Convex config in production and verify shared limits on deployed instances | Abuse bypasses limits; credit burn | **P0** |
| **B-05** | Convex component review | **done** | Decision doc written | Use Rate Limiter + RAG + R2 when each gap is addressed | Duplicate custom infra; wrong tool choices | **P0** (doc) |
| **B-06** | Ask retrieval over chunks | **target** | First 24 questions sent to OpenRouter (`buildFileAskInstructions`) | Chunk/MCQ search → relevant context only (Convex RAG) | Poor answers; high token cost on large files | **P2** |
| **B-07** | Server page-preview cache | **partial** | Question source endpoint + generated preview payloads are being wired; R2 not yet | R2 `pages/{fileHash}/{n}.webp` + Convex metadata + signed URLs | Re-render cost; no cross-device previews | **P1** |
| **B-08** | Admin cost dashboard / internal reporting | **partial** | `npm run report:cost` returns internal Convex report for cost by user/plan/feature/model/file, cache hit rate, cost per page/MCQ, duplicate charged files, audit failure counts, and margin flags | Add richer operator workflow later | No visibility into spend, abuse, or account economics | **P1** |
| **B-09** | Non-blocking upload/polling | **interim** | UI waits on sync extraction response | Same upload UI; poll Convex job status; study page loads when ready | Perceived slowness; connection drops fail upload | **P1** (with B-01) |
| **B-10** | DOCX/PPTX → PDF conversion | **blocked** | DOC/DOCX accepted but not converted server-side | Server conversion before extraction (or reject with clear error) | Unsupported uploads fail silently or confuse users | **P3** |
| **B-11** | Extraction cost containment | **partial** | Flash-Lite default, dynamic max tokens, in-process single-flight, Convex distributed extraction claim, stable cache/cost logs, deployed duplicate smoke script | Verify duplicate-upload behavior against deployed Vercel/Convex, then add hard suspicious-cost block after calibration | Repeated uploads/double-clicks create duplicate OpenRouter charges | **P0** |
| **B-12** | Per-user account economics | **partial** | Internal report compares user AI cost to plan revenue when `PLAN_REVENUE_USD_MAP` is configured; no public UI/copy | Reconcile revenue map with real Clerk Billing prices and review daily during paid beta | Paid plans can become unprofitable without detection | **P0** |

### Architecture options (reminder)

**Option 1 — target production**

- Trigger.dev for background extraction
- Cloudflare R2 for durable files/page previews
- Convex for usage ledger, cache metadata, jobs, quotas
- Clerk Billing sync into Convex
- Clerk as user identity

**Option 2 — interim/testing (now)**

- Keep current upload UI and sync `/api/pdf/mcqs`
- Convex for ledger/cache/job records where configured
- `.data` only in `NODE_ENV=development`
- IndexedDB as browser cache only
- Log every missing production piece here

---

## P0 — Cost & safety (production-ready vs interim)

| Item | Status | Notes |
|------|--------|-------|
| Usage ledger + quota preflight | **done** | `usagePeriods`, `aiUsageEvents`, `quotaReservations` |
| `trackedOpenRouter` on all OpenRouter paths | **done** | extract, chat, grammar, OCR (when enabled) |
| Cache hit zero-cost event | **done** | See [`USAGE-LEDGER-POLICY.md`](./USAGE-LEDGER-POLICY.md) |
| Production no silent `.data` | **done** | `assertProductionServerStorage` → 503 |
| Full-file multimodal fallback off | **done** | `ENABLE_FULL_FILE_MULTIMODAL_FALLBACK=false` |
| OCR off in upload pipeline | **done** | `/api/pdf/ocr` 403 unless explicit env |
| Convex-backed API rate limits | **partial** | Uses Convex Rate Limiter when configured; in-memory fallback is dev/testing only |
| Default extraction model ladder | **partial** | `.env.example` sets Flash-Lite extraction + Flash repair/chat; code uses repair model for invalid JSON/schema |
| In-flight extraction dedupe | **partial** | In-process single-flight plus Convex distributed job claim exist; deployed verification still needed |
| Cache-key/cost logging | **partial** | Structured cacheHit/inFlightHit/openRouterCalled and per-extraction cost logs plus internal report exist; richer admin workflow still deferred |

## P0 — Extraction cost containment checklist (B-11)

```txt
[x] Document env ladder:
    OPENROUTER_EXTRACTION_MODEL=google/gemini-2.5-flash-lite
    OPENROUTER_EXTRACTION_REPAIR_MODEL=google/gemini-2.5-flash
    OPENROUTER_CHAT_MODEL=google/gemini-2.5-flash
    OPENROUTER_AUTO_GRAMMAR_FIX=false

[x] Code repair fallback to use OPENROUTER_EXTRACTION_REPAIR_MODEL only after invalid JSON/schema.
[x] Add in-process single-flight lock:
    extractionKey = fileHash:extractionMode:extractionModel:appExtractionVersion
[x] If extractionKey already processing, wait for existing job/result and return inFlightHit=true.
[x] Add Convex distributed extraction claim for the same extractionKey.
[ ] Verify rapid duplicate uploads across deployed instances create one OpenRouter call.
[x] Log stable cache key on every extraction:
    fileHash, extractionMode, extractionModel, appExtractionVersion,
    cacheHit, inFlightHit, openRouterCalled
[x] Add suspicious-cost warning first:
    1-5 page files should normally estimate below $0.01.
[ ] Convert suspicious-cost warning into hard block after thresholds are calibrated.
[x] Cap extraction max_tokens dynamically:
    min(2500, estimatedQuestionCount * 220 + 500)
[ ] Keep grammar pass off unless OPENROUTER_AUTO_GRAMMAR_FIX=true.
[ ] Add repeated-upload tests:
    first upload calls OpenRouter once;
    post-success repeat hits cache;
    rapid double-click hits in-flight;
    extraction version bump invalidates cache;
    transient failure is not cached as success.
[x] Dev log model cost comparison:
    actual model vs Flash-Lite estimated cost and savings.
```

## P0 — Convex limits checklist

```txt
[x] Convex is source of truth for plan, limits, usage events, reservations.
[x] Clerk identifies user.
[x] Clerk Billing handles payment/subscription only.
[x] OpenRouter provides actual usage/cost only.
[x] Add Convex Rate Limiter to protected API routes (B-04).
[x] Add/verify monthly AI dollar budget by plan.
[x] Add/verify monthly page, file upload, chat, and active job limits.
[x] Add/verify max file size and max pages per file limits.
[x] Reserve estimated cost before OpenRouter; block quota_exceeded before paid call.
[x] Commit actual tokens/cost after OpenRouter.
[x] Release reservation after success/failure.
[ ] Add warnings at 75% and 90% budget used; block at 100%.
[ ] Reconcile actual Convex limit values with real Clerk Billing pricing source before first sale.
```

## Internal cost visibility (B-08/B-12)

No public UI or user-facing copy. This is operator-only reporting from Convex usage tables.

```txt
[x] Cost by user
[x] Cost by plan
[x] Cost by feature
[x] Cost by model
[x] Cost by file
[x] Cost per page
[x] Cost per extracted MCQ
[x] Cache hit rate
[x] Quota failures
[~] OpenRouter failures (usage/cost tracked; dedicated upstream failure aggregation still pending)
[x] Source failures
[x] Duplicate extraction attempts
[x] User plan value vs AI cost when `PLAN_REVENUE_USD_MAP` is configured
[x] Low-margin account flag
```

---

## Trigger.dev integration checklist (B-01, when ready)

```txt
[ ] Install @trigger.dev/sdk
[ ] Create extract-pdf task
[ ] Queue: extract (concurrency 10)
[ ] concurrencyKey per clerkUserId
[ ] POST /api/pdf/mcqs → enqueue → return jobId
[ ] Worker calls runPdfMcqExtraction (same engine)
[ ] UI polls job status (no redesign)
```

---

## R2 integration checklist (B-02, when ready)

```txt
[x] Configure R2 bucket + Convex component env vars in docs; deployed secrets still need `npx convex env set`
[x] Upload flow: client → Convex generateUploadUrl → R2 for source-file backup
[x] Store r2Key on file record
[ ] Worker reads from R2 instead of request body
[ ] Keep IndexedDB as optional offline cache only
```

**Note:** `@convex-dev/r2` is wired for original source-file persistence. Durable source preview images and worker reads from R2 remain open.

---

## Completed (reference)

| Item | Date |
|------|------|
| File hash extraction cache | May 2026 |
| Disable auto full-file fallback (default) | May 2026 |
| API rate limits (in-memory, userId-aware) | May 2026 |
| Chunk batch extraction | May 2026 |
| Convex usage ledger schema + mutations | May 2026 |
| Production storage guard (no silent `.data`) | May 2026 |
| Convex components review doc | May 2026 |
| Grammar + OCR through trackedOpenRouter | May 2026 |
| `.env.example` with all flags | May 2026 |

---

## Environment checklist

```env
# Identity
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=

# Convex (required in production for extraction cache/jobs)
NEXT_PUBLIC_CONVEX_URL=
EXTRACTION_STORAGE_SECRET=

# Usage ledger (optional in dev; explicit in prod)
USAGE_LEDGER_SECRET=
QUOTA_ENFORCEMENT_ENABLED=true

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
OPENROUTER_EXTRACTION_MODEL=google/gemini-2.5-flash-lite
OPENROUTER_EXTRACTION_REPAIR_MODEL=google/gemini-2.5-flash
OPENROUTER_EXTRACTION_MAX_TOKENS=2500
OPENROUTER_CHAT_MODEL=google/gemini-2.5-flash
OPENROUTER_AUTO_GRAMMAR_FIX=false
ENABLE_FULL_FILE_MULTIMODAL_FALLBACK=false
ENABLE_PDF_OCR_ROUTE=false

# Clerk Billing (B-03)
# Configure plan slugs/prices in Clerk Dashboard and verify against `convex/planLimits.ts`.

# R2 (B-02) — see Convex R2 component docs
# Trigger.dev (B-01)
# TRIGGER_SECRET_KEY=
```
