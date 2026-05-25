# Convex Components Review

> Decision log for installed `@convex-dev/*` components vs custom code.
> Installed in `convex/convex.config.ts`. **No UI changes.**

---

## Rate Limiter

**Use now?** yes

**Why:** In-memory token buckets in `src/lib/api-rate-limit.server.ts` are not shared across Vercel instances.

**What it replaces:** Custom local rate limits on `/api/pdf/mcqs`, `/api/chat`, `/api/pdf/fix-grammar`, `/api/pdf/ocr`.

**Risk:** One user can bypass limits by hitting different serverless instances; credit burn during abuse.

**Decision:** Use Convex Rate Limiter now for production-bound routes. Keep in-memory limits only as local/dev fallback. Protect `/api/pdf/mcqs`, `/api/chat`, `/api/pdf/fix-grammar`, and `/api/pdf/ocr`; key by Clerk userId with IP fallback for anonymous requests.

**Implementation status:** Next API routes now call `convex/apiRateLimits.ts` through `src/lib/api-rate-limit.server.ts` when `NEXT_PUBLIC_CONVEX_URL` is configured. Local token buckets remain only as the development fallback.

---

## Action Cache

**Use now?** later

**Why:** We have custom SHA-256 file cache (`fileCache` table + optional `.data` in dev).

**What it replaces:** Custom `lookupExtractionCache` / `persistExtractionCache`.

**Risk:** Duplicate cache systems; harder to reason about invalidation.

**Decision:** **Keep custom fileHash cache** for now — keyed by `fileHash + extractionMode + model + appExtractionVersion`. Revisit Action Cache if we need generic Convex action memoization beyond extraction.

---

## Workpool

**Use now?** no

**Why:** Not installed. Would be Option 2 for background jobs if Trigger.dev is delayed.

**What it replaces:** Sync `/api/pdf/mcqs` + manual job records.

**Risk:** Running Workpool + Trigger.dev later = duplicate orchestrators.

**Decision:** **Backlog.** Prefer Trigger.dev (B-01) for extraction jobs. If Trigger.dev slips, evaluate Workpool as interim only — do not integrate both.

---

## Workflow

**Use now?** later

**Why:** `processStudyFile` in `convex/workflows.ts` is an empty stub.

**What it replaces:** Trigger.dev durable workflows (target).

**Risk:** Partial Workflow implementation adds complexity without Trigger.dev-grade observability.

**Decision:** **Do not expand Workflow now.** Keep stub + local/Convex job records. Trigger.dev is Option 1 target (B-01).

---

## Action Retrier

**Use now?** no

**Why:** Batch extraction already has attempt/retry logic in `pdf-extraction.server.ts`.

**What it replaces:** Manual retry loops on OpenRouter failures.

**Risk:** Retrying without idempotency can double-charge if usage is committed twice.

**Decision:** **Backlog.** Only add if we centralize retries with reservation-aware idempotency keys.

---

## RAG

**Use now?** no

**Why:** Ask mode still sends first 24 questions (`buildFileAskInstructions`).

**What it replaces:** Truncated Ask context.

**Risk:** Poor answers + higher token cost on large files.

**Decision:** **Backlog B-06.** Use `convex/studyRag.ts` when implementing chunk retrieval for Ask.

---

## Cloudflare R2

**Use now?** yes, for original source files

**Why:** `convex/r2.ts` is registered and source-file persistence now stores R2 keys in `sourceFiles`; client-side source backup uses Convex R2 signed URLs and server-side source backup stores via `r2.store`.

**What it replaces:** Convex `_storage` for new source-file originals. Browser IndexedDB remains an optional local/offline cache.

**Risk:** Requires deployed Convex `R2_*` environment variables and real-upload QA before relying on it in production.

**Decision:** **B-02 partially complete.** Originals are wired to R2; source preview image/WebP storage is still B-07.

---

## Clerk Billing

**Use now?** yes

**Why:** Public pricing now uses Clerk Billing; request-time plan sync maps Clerk plan slugs into Convex usage limits.

**What it replaces:** Manual plan assignment.

**Risk:** Wrong plan-slug mapping can leave paid users on the wrong quota or unpaid users with paid quota.

**Decision:** **Use now.** Clerk Billing owns visible plans and checkout. Convex remains the enforcement source for plan, billingStatus, budgets, page/file/chat limits, active job limit, and file caps. Before first sale, verify Clerk plan slugs map to the intended Convex plan.

---

## PostHog

**Use now?** optional / later

**Why:** Component installed (`convex/posthog.ts`); product analytics not required for cost safety.

**What it replaces:** Ad-hoc logging.

**Risk:** None for cost control.

**Decision:** **Optional.** Use for product funnels later, not P0 for AI budget enforcement.

---

## Aggregate / Sharded Counter

**Use now?** no

**Why:** Not currently installed in `convex/convex.config.ts`. The custom `usagePeriods` table is enough for MVP-period totals.

**What it replaces:** Expensive aggregate queries over `aiUsageEvents` if event volume grows.

**Risk:** Premature counter infrastructure makes quota logic harder to audit.

**Decision:** Later only if usage volume makes monthly/user totals slow. Keep `usagePeriods` as the primary quota aggregate for now.

---

## Control Boundary

| System | Responsibility |
|--------|----------------|
| Clerk | Identity only |
| Clerk Billing | Payment/subscription state only |
| Convex | Plan, budgets, limits, usage periods, quota reservations, rate limits, cache metadata, job status |
| OpenRouter | Actual model execution and token/cost usage |

Do not let Clerk Billing or OpenRouter decide app spend eligibility. Convex preflight decides whether a paid AI call is allowed before OpenRouter is contacted.

---

## Summary table

| Component | Use now | Target | Replaces |
|-----------|---------|--------|----------|
| Rate Limiter | Yes | Yes | Local API buckets |
| Action Cache | No | Maybe | Custom fileHash cache |
| Workpool | No | If no Trigger.dev | Sync API |
| Workflow | Stub only | No (prefer Trigger.dev) | — |
| Action Retrier | No | Maybe | Manual retries |
| RAG | No | Yes (Ask) | First-24 context |
| R2 | No | Yes | IndexedDB |
| Clerk Billing | Yes | Yes | Manual plans |
| PostHog | Optional | Optional | — |
| Aggregate/Sharded Counter | No | Maybe | Usage total queries |
