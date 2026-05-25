# Usage Ledger Policy

> How OpenRouter calls are tracked. No UI impact.

---

## Rule: every paid OpenRouter path uses `trackedOpenRouter`

| Route | Feature | Status |
|-------|---------|--------|
| `/api/pdf/mcqs` | `extract` | ✅ `trackedOpenRouterFetch` |
| `/api/chat` | `ask` or `tutor` | ✅ preflight + `onFinish` commit |
| `/api/pdf/fix-grammar` | `grammar` | ✅ when user identified |
| `/api/pdf/ocr` | `ocr` | ✅ when route enabled + user identified |

---

## Cache hits (policy decision)

**Decision:** Cache hits do **not** call OpenRouter and record a **zero-cost usage event** when quota enforcement is enabled.

```ts
{
  feature: "extract",
  costUsd: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cached: true,
  status: "final",
}
```

Why: Admin metrics need cache hit rate; users should not be charged; audit trail stays complete.

When quota enforcement is off: no event written (local testing only).

---

## Quota flow (when `QUOTA_ENFORCEMENT_ENABLED=true`)

```txt
1. Identify user (Clerk userId or anon:{ip})
2. preflightAiUsage — check budget/pages/uploads/chat + reserve estimated cost
3. OpenRouter call (if allowed)
4. commitAiUsage — actual tokens + costUsd
5. releaseQuotaReservation — release hold
```

Quota failure → HTTP **402**, OpenRouter **not** called.

Production with quota enabled but missing Convex config → HTTP **503** (config error), not silent allow.

---

## Source of truth

| System | Owns |
|--------|------|
| Clerk | User identity |
| Clerk Billing | Payment and subscription lifecycle |
| Convex | Plan, budgets, usage totals, quota reservations, rate limits, job status, cache metadata |
| OpenRouter | Actual model usage and cost |

Convex decides whether a user is allowed to spend more before OpenRouter is called.

---

## Required user limits

Use multiple limits, not only monthly AI spend:

```txt
monthlyAiBudgetUsd
monthlyPageLimit
monthlyFileLimit
monthlyChatLimit
activeExtractionLimit
maxFileSizeBytes
maxPagesPerFile
```

Required behavior:

```txt
[ ] Check budget before every OpenRouter call.
[x] Check page/file/chat/active-job limits before the relevant action.
[x] Check max file size and max pages per file before extraction.
[ ] Reserve estimated cost before OpenRouter.
[ ] Commit actual tokens/cost after OpenRouter.
[ ] Release reservations on success/failure.
[ ] Return quota_exceeded without calling OpenRouter when limits fail.
[ ] Warn internally at 75% and 90% usage; block at 100%.
```

---

## Internal operator reporting

No public UI or user-facing copy.

Every extraction should log enough data to answer:

```txt
cost per user
cost per plan
cost per file
cost per page
cost per MCQ
cache hit rate
quota failure rate
model mix
user plan value vs AI cost
low-margin accounts
```

Cost/revenue comparison belongs in an internal admin/reporting workflow only.
Use the real product pricing source of truth for revenue comparisons; do not
copy sample public-launch pricing into code or docs.

Current operator entrypoint:

```bash
npm run report:cost
```

Set `PLAN_REVENUE_USD_MAP` from the real Clerk Billing/product pricing source of truth
to enable warning/danger margin flags.

---

## Production storage (no silent `.data`)

| Environment | Cache/jobs source |
|-------------|-------------------|
| `development` | `.data/` allowed + Convex sync if configured |
| `production` | Convex **required** — missing config → 503 |

IndexedDB remains browser cache only; never production source of truth.
