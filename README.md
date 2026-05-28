# TestNote Production Runbook

Operational checklist for the Next.js 16 app, Convex backend, source-file storage, extraction jobs, quota enforcement, and source preview QA.

## Required Services

- Clerk for auth.
- Convex for metadata, extraction jobs, source files, usage ledger, audit events, and optional storage.
- OpenRouter for extraction, chat, OCR, and grammar calls.
- Clerk Billing for plan display and subscription state.
- PostHog and Resend where enabled.

## Required Environment

Next.js runtime:

```bash
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
ADMIN_EMAIL=mousab.r@gmail.com
NEXT_PUBLIC_APP_URL=
OPENROUTER_API_KEY=
EXTRACTION_STORAGE_SECRET=
USAGE_LEDGER_SECRET=
QUOTA_ENFORCEMENT_ENABLED=true
MAX_SERVER_UPLOAD_BYTES=524288000
NEXT_PROXY_CLIENT_MAX_BODY_SIZE=500mb
NEXT_PUBLIC_ENABLE_SERVER_PAGE_PREVIEW=true
```

Convex runtime:

```bash
CLERK_JWT_ISSUER_DOMAIN=https://clerk.drnote.co
CLERK_JWT_ISSUER_DOMAIN_DEV=https://your-app.clerk.accounts.dev
ADMIN_CLERK_USER_IDS=user_dev,user_prod
ADMIN_EMAIL=mousab.r@gmail.com
EXTRACTION_STORAGE_SECRET=
USAGE_LEDGER_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_PERSONAL_API_KEY=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
RESEND_FROM_EMAIL=
CLOUDFLARE_ACCOUNT_ID=5000e0a4f0ca6dd90b08bde9dc11ccb9
R2_BUCKET=drnote-uploads-prod
R2_OBJECT_PREFIX=prod
R2_ENDPOINT=https://5000e0a4f0ca6dd90b08bde9dc11ccb9.r2.cloudflarestorage.com
R2_TOKEN=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Optional extraction guardrails:

```bash
EXTRACTION_SUSPICIOUS_SMALL_FILE_MAX_USD=0.08
EXTRACTION_SUSPICIOUS_MAX_USD_PER_PAGE=0.035
EXTRACTION_LOCK_STALE_AFTER_MS=600000
EXTRACTION_LOCK_RETRY_COOLDOWN_MS=60000
```

## Extraction Flow

1. `POST /api/pdf/mcqs` validates the file, computes hash/page count, and persists the original source file.
2. The route reuses an active matching job when one exists, otherwise creates an `extractionJobs` row and returns `202` with `jobId`.
3. The secured worker endpoint `/api/pdf/mcqs/worker` claims queued jobs, and Convex Cron calls it every two minutes for recovery.
4. The client polls `GET /api/pdf/mcqs/jobs/[jobId]`.
5. Completed jobs return the persisted extraction record with MCQs and source chunks.
6. Failed jobs return `failureReason` and user-facing error text.

Convex tables involved: `sourceFiles`, `fileCache`, `pdfExtractionRecords`, `extractionJobs`, `questionSources`, `usagePeriods`, `aiUsageEvents`, `costLedger`, `quotaReservations`, and `appAuditEvents`.

Original signed-in source files and generated source page preview WebP images are stored through the Convex R2 component when `R2_*` Convex environment variables are configured. Use a separate `R2_OBJECT_PREFIX` per environment, for example `prod` and `dev`, if deployments share one bucket. Source-file object keys use a hashed email owner segment when available so recreating a Clerk user for the same email does not create a second visible user folder. Existing Convex `_storage` source-file rows still resolve as a fallback.

## Quota Enforcement Checks

Before enabling serious beta, verify in deployment:

- Monthly AI budget blocks once `usagePeriods.aiCostUsd + reservations + estimate` exceeds `monthlyAiBudgetUsd`.
- Budget warning audit events are written at 75% and 90% projected usage.
- Monthly pages, files, chat messages, active extraction count, file page count, and file size all block at plan limits.
- Failed quota preflight does not call OpenRouter and writes `quota_exceeded` plus `openrouter_call_blocked`.

Useful commands:

```bash
npm run report:cost
npm run test:pipeline-safety
```

## Source Preview QA

Source previews are generated during extraction from source chunks, stored through `questionSources`, and served by `GET /api/pdf/page-preview`.

Run:

```bash
npm run test:source-qa
npm run test:source-qa-manual
```

Expected manual QA output: all generated fixture cases pass and `.qa/manual-qa-report.json` is updated.

## Build And Release

```bash
npx convex codegen
npm run test:source-qa
npm run test:pipeline-safety
npm run test:extraction-failure
npm run report:bundle
npx tsc --noEmit
npm run build
```

`next.config.ts` transpiles `pdfjs-dist`; production builds should not emit the old pdfjs externalization warnings.

`npm run report:bundle` expects a completed `.next` production build and prints
the total JS/CSS bytes plus the largest emitted static assets. Lighthouse
baselines can be saved under `.qa/` during release QA.

## Incident Triage

- Upload returns quickly but spinner stalls: inspect `/api/pdf/mcqs/jobs/[jobId]` and Convex `extractionJobs`.
- Job is failed with `quota_exceeded`: inspect `usagePeriods`, `quotaReservations`, and `appAuditEvents`.
- Source modal falls back to PDF.js: inspect `questionSources` and `/api/pdf/page-preview?fileId=...&pageNumber=...`.
- Duplicate uploads: inspect `fileCache`, `extractionJobs.by_extraction_key`, and `appAuditEvents` duplicate extraction events.
# testnote
