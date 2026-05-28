# Launch Status Report

**Generated:** 2026-05-27  
**Site:** https://www.drnote.co  
**Verdict:** Code is largely ready; paid launch blocked by external config + live verification.

---

## Executive summary

The repository contains the full payment and quota pipeline: Clerk Billing UI, webhook handler, Convex plan sync, `preflightAiUsage`, audit events, rate limiting, and duplicate-extraction guards. What remains is proving that chain on production with real Clerk Billing events, OpenRouter dashboard caps, and manual quota smoke tests per plan.

**Paid launch readiness: ~45%** (unchanged — trust, not features, is the gap).

**This pass added:**

- Quota/billing/rate-limit error classification (`src/lib/quota-errors.ts`)
- Upgrade/manage-billing banners on upload surfaces (`QuotaLimitBanner`)
- Tutor chat guidance when limits hit
- Real current-period usage visibility in the dashboard usage popover
- Convex Cron worker recovery for queued/stale extraction jobs (`/api/pdf/mcqs/worker`)
- Production `CRON_SECRET` and `CLERK_WEBHOOK_SIGNING_SECRET` presence verified through Vercel CLI
- Source QA fixture matrix re-run: `npm run test:source-qa-manual` passed 19/19
- Internal cost report re-run and returned quota/rate-limit/duplicate/source signals
- Ordered launch-day runbook (`docs/LAUNCH_DAY_RUNBOOK.md`)
- Unit tests: `npm run test:quota-errors`

---

## Scorecard (unchanged counts, verified against codebase)

| Tier | ✅ Done | ⚠️ Needs live proof | ❌ Not done |
|------|---------|---------------------|-------------|
| P0 | 10 | 5 | 1 |
| P1 | 12 | 3 | 7 |
| P2 | 15 | 1 | 8 |
| P3 | 10 | 0 | 0 |
| **Total** | **47** | **9** | **16** |

Treat every ⚠️ in P0 billing/quota as ❌ until production proof.

---

## P0 — Must fix before taking money

| # | Status | What’s left |
|---|--------|-------------|
| 2–5 | ⚠️ | **Clerk Billing → Convex not production-verified.** Code: `/api/webhooks/clerk`, `syncClerkBillingPlanToConvex`, `parseClerkBillingWebhook`. Still need: `CLERK_WEBHOOK_SIGNING_SECRET` on Vercel, webhook URL `https://www.drnote.co/api/webhooks/clerk`, real subscribe/cancel/past-due test, Clerk plan slugs/prices aligned with `convex/planLimits.ts` + `CLERK_BILLING_*_PLAN` env vars. |
| 7 | ❌ | **OpenRouter hard spend caps** — OpenRouter dashboard only, not in repo. |
| 8 | ⚠️ | **Duplicate upload = one paid call** — last run hit 429; re-run `npm run test:deployed-duplicate-extraction` after cooldown with auth. |
| 9 | ✅ | Convex-backed rate limits verified live (429 on `/api/pdf/mcqs`). |
| 10–15 | ✅ | Lint, production Clerk keys, hidden unfinished copy — done. |

### Payment/limit chain (coded, not proven live)

```
/pricing (PricingTable)
  → Clerk checkout
  → webhook POST /api/webhooks/clerk
  → syncClerkBillingFromWebhook
  → Convex users.plan + billingStatus
  → preflightAiUsage (planLimits.ts)
  → blocked if canceled/past_due (isBillingActive)
  → QuotaLimitBanner in upload UI (NEW)
```

---

## P1 — Beta / reliability

| # | Status | What’s left |
|---|--------|-------------|
| 19, 21 | ⚠️ | Extraction still uses Next `after()` for the initial path, but a secured Convex Cron worker now calls a recovery endpoint that claims queued/stale Convex jobs and reruns extraction from persisted source files. Large uploads can still feel stuck if the source file was not persisted before worker recovery. |
| 22–23 | ❌ | Manual PDF QA — source browser + modal (hang/404 loops). |
| 28–31 | ❌ | Deployed quota enforcement — code + unit tests exist; no live proof for monthly AI/pages/files/chat, active jobs, max pages/file, max file size. |

---

## P2 — Feature QA (honest copy helps; still product risk in dashboard)

| # | Status | What’s left |
|---|--------|-------------|
| 42 | ❌ | Summary mode with real uploads |
| 43 | ❌ | Download/export |
| 44 | ❌ | Library across sessions/devices |
| 45 | ❌ | Sessions persistence |
| 47 | ❌ | Flashcards on real extracted files |
| 48 | ⚠️ | Quiz pause/resume — unit tests only |
| 49 | ❌ | Exam timing + final review |
| 50 | ❌ | Ask AI grounding on real uploads |

Public copy no longer promises unfinished paid features (✅).

---

## P3 — Done

All 10 P3 items ✅. No open polish blockers.

---

## Infrastructure risks

| Risk | Detail | Action |
|------|--------|--------|
| Convex deployment naming | Vercel `NEXT_PUBLIC_CONVEX_URL` → `blessed-fish-200` (dev label) vs `vivid-fly-266` (prod label) | Reconcile before first sale |
| Plan slug confusion | `max` + `teams` both map to Convex `school` | OK short-term; document for support |
| `QUOTA_ENFORCEMENT_ENABLED` | If false in prod, limits disabled | Confirm `true` on Vercel |
| Stripe portal vs Clerk Billing | `convex/billing.ts` has Stripe portal; app uses Clerk Billing on `/pricing` | Manage subs via Clerk PricingTable / UserButton, not Stripe portal |

---

## Gaps addressed this pass

### 1. In-app upgrade path when limits hit ✅ (code)

| Surface | Before | After |
|---------|--------|-------|
| `qbank-upload.tsx` | Generic red error | Classified banner + Upgrade / Manage billing → `/pricing` |
| `file-list.tsx` (dashboard) | Plain red text | Same banner |
| `pdf-dropzone.tsx` | Plain red text | Same banner |
| Tutor (ask/quiz) | Raw API error | Appends `/pricing` guidance for quota/billing errors |
| Rate limit (429) | Same as quota | Amber banner, no false upgrade CTA |

### 2. Free-tier vs paid-tier usage visibility ✅ (code)

Dashboard usage now reads `api.users.getMyUsageDashboard`, which uses Convex `usagePeriods` for current-month uploads, pages, chat messages, and remaining credits.

### 2b. Durable extraction worker recovery ✅ / ⚠️

Convex Cron calls `/api/pdf/mcqs/worker` every two minutes through `EXTRACTION_WORKER_URL`. The worker is secured by `CRON_SECRET`/`EXTRACTION_STORAGE_SECRET`, claims queued/stale Convex extraction jobs via `claimNextWorkerExtractionJob`, downloads the persisted source file, and runs the existing extraction engine. This is a recovery worker, not a full migration away from the upload route's Next `after()` path.

### 3. Clerk customer portal ❌ (verify manually)

Pricing page uses `<PricingTable for="user" />`. Confirm existing subscribers can update card/cancel via Clerk Billing UI and that cancel flows through webhook (Phase D in runbook).

### 4. Staging smoke + paid-launch tables ❌

`PUBLISH_READINESS_CHECKLIST.md` tables still “Not started” — use `LAUNCH_DAY_RUNBOOK.md` phases instead.

### 5. Ops monitoring ❌

- `support@drnote.co` — confirm routing
- `/dashboard/internal` + `npm run report:cost` on schedule
- Alert on `quota_exceeded`, `openrouter_call_blocked`, duplicate spikes

---

## Plan limits reference (`convex/planLimits.ts`)

| Plan | AI $/mo | Files/mo | Pages/mo | Pages/file | Max file | Active jobs | Chat/day |
|------|---------|----------|----------|------------|----------|-------------|----------|
| free | 0.05 | 3 | 100 | 50 | 20 MB | 1 | 20 |
| starter | 2 | 20 | 2,000 | 300 | 100 MB | 2 | 100 |
| pro | 8 | 100 | 10,000 | 2,000 | 250 MB | 4 | 500 |
| school | 50 | 500 | 100,000 | 5,000 | 500 MB | 8 | 2,000 |

---

## Suggested launch order

Minimum to **charge money** (Phases A–G in runbook):

1. Clerk Billing plans + slugs (B)
2. Webhook secret + live subscribe/cancel test (B, D)
3. Paid user gets correct limits (D, E)
4. Cancel/past_due blocks AI (D, E)
5. Deploy quota smoke — budget/pages/files/size/jobs (E)
6. OpenRouter hard caps (C)
7. Duplicate upload test (F)

Minimum for **serious beta**: add H (real PDF QA), usage visibility (future), P2 smoke on upload → quiz → source.

---

## Commands checklist

```bash
npm run test:publish-readiness    # lint + unit gates
npm run test:quota-errors         # NEW — error classification
npm run test:clerk-billing        # webhook parser
npm run report:cost               # needs Convex secrets
npm run test:deployed-duplicate-extraction  # needs auth + PDF
```

---

## Files changed this pass

- `src/lib/quota-errors.ts` — classify quota / billing / rate-limit errors
- `src/components/quota-limit-banner.tsx` — upgrade/manage-billing UI
- `src/components/qbank-upload.tsx` — banner on upload errors
- `src/components/pdf/file-list.tsx` — dashboard upload errors
- `src/components/pdf/pdf-dropzone.tsx` — home upload errors
- `src/components/pdf/pdf-study-panel.tsx` — tutor error formatting
- `src/components/pdf/quiz-floating-tutor.tsx` — tutor error formatting
- `src/lib/__tests__/quota-errors.test.ts` — unit tests
- `docs/LAUNCH_DAY_RUNBOOK.md` — ordered launch procedure
- `docs/LAUNCH_STATUS_REPORT.md` — this report
