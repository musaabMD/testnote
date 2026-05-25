# TestNote Platform Stack

> Target architecture with **interim fallbacks** where services are not fully integrated yet.
> **No UI changes** required for any phase.

---

## Target stack

```txt
Clerk          → identity + Clerk Billing plan state
Convex         → real-time usage ledger + quota enforcement (are they allowed to spend?)
OpenRouter     → AI inference + actual token/cost source
Vercel         → Next.js app + API routes
```

## Golden rule

**Do not use billing metadata as the real-time usage limiter.**

- Clerk Billing → subscription state and plan display, not pre-call guardrails
- Convex → check **before** every AI call; record **after** every AI call

---

## Request flow (target)

```txt
User uploads file
  → Clerk identifies user
  → Convex checks plan + quota + reserves estimated cost
  → `/api/pdf/mcqs` creates an extraction job
  → Next `after()` continues extraction work after the 202 response
  → trackedOpenRouterCall records actual tokens/cost in Convex
  → Clerk Billing plan state maps to Convex plan limits
  → Convex blocks user when monthly AI budget reached
```

---

## Service responsibilities

| Need | Primary (target) | Interim (active today) |
|------|------------------|------------------------|
| Auth user ID | Clerk | Clerk (or `anon:{ip}` when unsigned) |
| Plan display | Clerk Billing | Clerk `<PricingTable />` |
| Subscription truth | Clerk Billing | `syncClerkBillingPlanToConvex()` maps Clerk plan slugs to Convex limits |
| Real-time quota | Convex `usagePeriods` + `quotaReservations` | ✅ Implemented (enable with env) |
| AI cost tracking | Convex `aiUsageEvents` + OpenRouter `usage` | ✅ `trackedOpenRouterFetch` on extract + chat |
| Background jobs | Durable worker/queue | `/api/pdf/mcqs` job row + Next `after()` |
| File storage | Convex/R2 storage | Convex source-file storage for signed-in users, browser cache fallback |
| Rate limits | Convex token buckets | In-memory API limiter + Convex when deployed |
| App hosting | Vercel | Vercel |

---

## Convex usage ledger (implemented)

### Tables

| Table | Purpose |
|-------|---------|
| `users` | `clerkUserId`, `plan`, `billingStatus`, monthly limits |
| `usagePeriods` | Rolling monthly counters: `aiCostUsd`, pages, uploads, chat |
| `aiUsageEvents` | Per-call audit: feature, model, tokens, `costUsd`, OpenRouter generation ID |
| `quotaReservations` | Pre-call budget hold (`reserved` → `released` after job) |
| `appAuditEvents` | Operational events: quota blocks, rate limits, duplicate extraction, source failures |

### Plan limits (`convex/planLimits.ts`)

`convex/planLimits.ts` is the backend enforcement source for AI budget, pages,
files, chat, active jobs, file size, and per-file page caps.

Do not copy sample pricing from launch checklists into this file. Before paid
launch, reconcile Convex limits with Clerk Billing plan slugs and visible plan copy.

### Wrapper (`src/lib/tracked-openrouter.server.ts`)

Every OpenRouter call should go through:

```ts
await trackedOpenRouterFetch(ctx, model, init);
// 1. preflightAiUsage (reserve)
// 2. fetch OpenRouter
// 3. parse usage.cost from response
// 4. commitAiUsage to Convex
// 5. releaseQuotaReservation
```

Wired today:
- ✅ `/api/pdf/mcqs` extraction (chunk + optional full-file)
- ✅ `/api/chat` (preflight + `onFinish` usage commit)
- ✅ `/api/pdf/fix-grammar` when explicitly enabled
- ✅ `/api/pdf/ocr` when explicitly enabled; route remains disabled by default

---

## OpenRouter protection layers

```txt
Layer 1: OpenRouter API key credit limit (set in OpenRouter dashboard)
Layer 2: Convex per-user monthly AI budget (preflight)
Layer 3: Trigger.dev per-user concurrency (backlog)
Layer 4: Convex Rate Limiter when configured; in-memory fallback for dev only
```

Recommended keys:
```txt
dev key:       $5 cap
staging key:   $10 cap
production key: survivable weekly cap
```

---

## Interim vs target: background extraction

### Target (Trigger.dev)

```ts
queue: { name: "extract", concurrencyLimit: 10 }
concurrencyKey: `user:${userId}`
active job cap: read from Convex plan limits
```

### Interim (today)

```txt
POST /api/pdf/mcqs runs synchronously in Vercel function
ExtractionJob records written to Convex when EXTRACTION_STORAGE_SECRET is set
Local .data fallback is development-only
UI unchanged — still waits for response
```

**Why interim works:** Same API contract; jobs table ready for Trigger.dev worker to take over.

---

## Interim vs target: file storage

### Target (R2)

```txt
users/{userId}/files/{fileId}/original.pdf
users/{userId}/files/{fileId}/pages/{pageNumber}.webp
```

Convex `@convex-dev/r2` is now wired for original source-file persistence:
client backup uploads use R2 signed URLs, and server backup stores source bytes
through `r2.store`. IndexedDB remains a local/offline cache.

### Interim (today)

```txt
Cloudflare R2: signed-in source-file originals
Browser IndexedDB: drnote-pdf-sources (optional local ArrayBuffer cache)
Server .data/extraction-cache: hashed MCQ results
```

---

## Clerk Billing integration

### Active plan sync

```txt
Request resolves Clerk user
  → syncClerkBillingPlanToConvex()
  → Clerk `has({ plan })` check maps to Convex free/starter/pro/school limits
```

### Today

- Public pricing is rendered by Clerk Billing.
- `src/lib/clerk-billing.server.ts` maps Clerk plan slugs into Convex quota profiles.
- **Before first sale:** verify real Clerk Billing plan slugs, prices, and limits match
  `convex/planLimits.ts`.

---

## Enable quota enforcement

```env
NEXT_PUBLIC_CONVEX_URL=https://...
USAGE_LEDGER_SECRET=your-random-secret
QUOTA_ENFORCEMENT_ENABLED=true
```

Run `npx convex dev` to push schema.

---

## Admin dashboard (backlog)

`/admin/usage` — cost today/month, by user/feature/model, cache hit rate, fallback count.

See [BACKLOG.md](./BACKLOG.md).

---

## Related docs

- [PUBLISH_READINESS_CHECKLIST.md](./PUBLISH_READINESS_CHECKLIST.md)
- [PUBLISH_TASK_STATUS.md](./PUBLISH_TASK_STATUS.md)
- [BACKLOG.md](./BACKLOG.md)
