# Paid Launch Day Runbook

Use this on launch day for `https://www.drnote.co`. Treat every ⚠️ billing/quota item as ❌ until you prove it with real Clerk Billing events and a signed-in test user per plan.

**Owner columns:** fill in names before launch day.

---

## Phase A — Pre-flight (before touching production billing)

| Step | Action | Owner | Pass criteria |
|------|--------|-------|---------------|
| A1 | Confirm Vercel production env | | `QUOTA_ENFORCEMENT_ENABLED=true`, `USAGE_LEDGER_SECRET`, `EXTRACTION_STORAGE_SECRET`, `CLERK_WEBHOOK_SIGNING_SECRET`, `OPENROUTER_API_KEY` all set |
| A2 | Reconcile Convex deployment | | `NEXT_PUBLIC_CONVEX_URL` on Vercel points at the deployment you intend for prod (currently `blessed-fish-200` label vs `vivid-fly-266` — pick one, document it) |
| A3 | Run repo gates locally | | `npm run test:publish-readiness` passes |
| A4 | Pull production env locally (optional) | | `vercel env pull .env.production.local` — never commit |

```bash
cd /path/to/TestNote
npm run test:publish-readiness
npm run test:quota-errors
npm run test:clerk-billing
npx tsc --noEmit
npm run build
```

---

## Phase B — Clerk Billing configuration

| Step | Action | Owner | Pass criteria |
|------|--------|-------|---------------|
| B1 | Clerk Dashboard → Billing → Plans | | Plans exist with slugs matching Vercel env vars |
| B2 | Map slugs to Convex limits | | Slugs align with `convex/planLimits.ts` and env: `CLERK_BILLING_STARTER_PLAN`, `CLERK_BILLING_PRO_PLAN`, `CLERK_BILLING_MAX_PLAN`, `CLERK_BILLING_TEAMS_PLAN` |
| B3 | Public pricing copy | | Clerk Billing displayed limits ≤ backend limits in `convex/planLimits.ts` |
| B4 | Webhook endpoint | | Clerk webhook URL: `https://www.drnote.co/api/webhooks/clerk` |
| B5 | Webhook secret | | `CLERK_WEBHOOK_SIGNING_SECRET` on Vercel matches Clerk Dashboard signing secret |
| B6 | Redeploy after secret add | | New production deployment includes webhook secret |

### Plan slug → Convex mapping (code reference)

| Clerk slug (env default) | Convex plan | Monthly AI budget |
|--------------------------|-------------|-------------------|
| `starter` | starter | $2 |
| `pro` | pro | $8 |
| `max` | school | $50 |
| `teams` | school | $50 |
| (none) | free | $0.05 |

Source: `src/lib/clerk-billing.server.ts`, `convex/planLimits.ts`

---

## Phase C — OpenRouter hard caps (external, not in repo)

| Step | Action | Owner | Pass criteria |
|------|--------|-------|---------------|
| C1 | OpenRouter → Settings → Limits | | Hard spend cap set on production API key |
| C2 | Separate dev/staging keys | | Lower caps on non-prod keys |
| C3 | Document cap values | | Note monthly $ cap in runbook notes below |

**Launch notes (fill in):**

- Production cap: $________ / month
- Staging cap: $________ / month

---

## Phase D — Billing lifecycle smoke (real Clerk test users)

Create one test account per plan tier. Use Clerk test mode or disposable emails.

| Step | Action | Owner | Pass criteria |
|------|--------|-------|---------------|
| D1 | Free user signs in | | Can upload until free limits hit |
| D2 | Subscribe to Starter on `/pricing` | | Checkout completes, redirects to `/dashboard` |
| D3 | Verify Convex plan sync | | Convex `users` row: `plan=starter`, `billingStatus=active` (via dashboard/internal or Convex dashboard) |
| D4 | Paid limits apply | | Upload a file within starter limits succeeds; check `usagePeriods` increments |
| D5 | Cancel subscription | | Clerk fires webhook → Convex `plan=free`, `billingStatus=canceled` |
| D6 | Canceled user blocked | | AI extraction returns billing/quota error; UI shows **Manage billing** / **Upgrade plan** banner |
| D7 | Past-due simulation (if available) | | Same downgrade path as cancel; AI blocked |

```bash
# After subscribe/cancel, inspect cost report
npm run report:cost
```

Webhook parser unit tests (local sanity):

```bash
npm run test:clerk-billing
```

---

## Phase E — Deployed quota enforcement smoke

Sign in as **free** user first, then repeat key checks on **starter** if time allows.

| Limit | How to trigger | Expected error (contains) | UI check |
|-------|----------------|---------------------------|----------|
| Monthly AI budget | Exhaust $0.05 free budget | `Monthly AI budget reached` | Upgrade banner → `/pricing` |
| Monthly file count | Upload 4th file in period | `Monthly upload limit reached` | Upgrade banner |
| Max pages/file | Upload PDF > 50 pages | `page count exceeds` | Upgrade banner |
| Max file size | Upload file > 20 MB (free) | `File is too large` | Upgrade banner |
| Active extraction jobs | Start 2 extractions concurrently (free max 1) | `Too many active extraction jobs` | Upgrade banner |
| Daily chat | Send 21+ tutor messages (free) | `Daily chat limit reached` | Tutor shows pricing guidance |
| Billing inactive | Use canceled user from D5 | `Subscription inactive` | Manage billing banner |

Record results:

| Check | Free | Starter | Pro | Pass? |
|-------|------|---------|-----|-------|
| AI budget block | | | | |
| File count block | | | | |
| Pages/file block | | | | |
| File size block | | | | |
| Active jobs block | | | | |
| Chat limit block | | | | |
| Billing inactive block | | | | |

---

## Phase F — Duplicate upload = one paid call

| Step | Action | Owner | Pass criteria |
|------|--------|-------|---------------|
| F1 | Wait for rate-limit cooldown if prior 429 | | No 429 on first request |
| F2 | Set env for script | | `DEPLOYED_BASE_URL=https://www.drnote.co`, `DEPLOYED_TEST_PDF_PATH=...`, auth cookie or bearer |
| F3 | Run duplicate test | | Script reports single OpenRouter call |

```bash
export DEPLOYED_BASE_URL=https://www.drnote.co
export DEPLOYED_TEST_PDF_PATH=/path/to/small-test.pdf
# Set DEPLOYED_AUTH_COOKIE or DEPLOYED_AUTH_BEARER from signed-in browser session
npm run test:deployed-duplicate-extraction
```

Also verify in Convex `appAuditEvents`: no duplicate paid extraction for same file hash.

---

## Phase G — Rate limiting (already partially verified)

| Step | Action | Pass criteria |
|------|--------|---------------|
| G1 | Burst requests to `/api/pdf/mcqs` | Returns `429` with `Rate limit exceeded` |
| G2 | Upload UI on 429 | Shows amber **Too many requests** banner (no false upgrade CTA) |

---

## Phase H — Real PDF QA (P1, not money blocker but beta risk)

| Step | Action | Pass criteria |
|------|--------|---------------|
| H1 | Upload small searchable PDF (4+ MCQs) | Job completes, study modes load |
| H2 | Open source preview from question | No hang, no 404 loop |
| H3 | Quiz → exam → flashcards on same file | No crash |
| H4 | Unsupported file (DOCX) | Clear rejection message |
| H5 | Oversized file | Clear size limit message + upgrade path |

```bash
npm run test:source-qa
npm run test:source-qa-manual   # optional fixture pass
```

---

## Phase I — Ops monitoring before go-live

| Step | Action | Owner | Pass criteria |
|------|--------|-------|---------------|
| I1 | `support@drnote.co` monitored | | Inbox has owner + SLA |
| I2 | Internal dashboard | | `/dashboard/internal?token=...` loads cost + audit events |
| I3 | Schedule cost report | | Weekly `npm run report:cost` or Convex cron note |
| I4 | Alert on audit events | | Watch `quota_exceeded`, `openrouter_call_blocked`, duplicate extraction spikes |

---

## Phase J — Go / no-go

| Gate | Required for paid launch? | Status |
|------|---------------------------|--------|
| B1–B6 Clerk Billing + webhook live | **Yes** | |
| C1 OpenRouter hard caps | **Yes** | |
| D3–D6 Subscribe + cancel sync | **Yes** | |
| E All quota rows (free minimum) | **Yes** | |
| F Duplicate upload test | **Yes** | |
| G Rate limit UI distinction | **Yes** | |
| H Source preview QA | Recommended | |
| I Ops monitoring | Recommended | |

**Go/no-go owner:** _________________  
**Date/time:** _________________  
**Decision:** GO / NO-GO  
**Notes:**

---

## Quick reference commands

```bash
# Full pre-launch gate
npm run test:publish-readiness

# Cost + abuse snapshot (needs Convex secrets)
npm run report:cost

# Live duplicate charge test
npm run test:deployed-duplicate-extraction

# Unit: billing webhook parser
npm run test:clerk-billing

# Unit: quota error classification + upgrade UX
npm run test:quota-errors
```

## Payment → limit chain (must work end-to-end)

1. User checks out on `/pricing` (`<PricingTable />`)
2. Clerk webhook → `POST /api/webhooks/clerk` → `syncClerkBillingFromWebhook` → Convex `users.plan` + `billingStatus`
3. `preflightAiUsage` applies limits from `convex/planLimits.ts`
4. Canceled/past_due → `free` + `isBillingActive` blocks AI
5. Upload/tutor UI shows classified error + CTA to `/pricing`

None of steps 2–5 are proven until Phase D + E pass on production.
