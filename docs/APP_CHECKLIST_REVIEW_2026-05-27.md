# App Checklist Review

Review date: 2026-05-28

## Summary

Current state: the app is suitable for staging/demo validation, but paid production launch is still blocked by live billing/quota proof and external dashboard configuration.

- Done in code/docs: most app and safety plumbing is implemented, including usage visibility, explicit production Clerk plan slug env vars, and durable worker-first extraction.
- Partial: billing lifecycle and duplicate-charge proof still need live authenticated staging/payment proof.
- Not done: remaining items are mostly external dashboard actions, signed-in staging verification, manual real-PDF QA, and R2/WebP preview optimization.
- Implemented in this pass: `/api/pdf/mcqs` no longer uses Next `after()` as the primary extraction path; uploads must persist a source file first, duplicate uploads reuse an active job, and Convex Cron/worker processes queued jobs.

## Verification Pass — 2026-05-28

```txt
[x] npm run lint passed.
[x] npm run test:pipeline-safety passed: 56/56.
[x] npm run test:source-qa passed: 22/22.
[x] npm run test:source-qa-manual passed: 19/19.
[x] npm run test:clerk-billing passed: 4/4.
[x] npm run test:extraction-failure passed: 14/14.
[x] npm run test:quiz-progress passed: 3/3.
[x] npm run test:quota-errors passed: 6/6.
[x] npm run report:cost ran against Convex data; current-period cost was $0.241568 with duplicate-charge signals on two file hashes.
[x] Local HTTP smoke passed for /.
[x] Local worker smoke passed: unauthenticated worker returns 401, authenticated worker returns 200 idle.
[x] Production worker route is live: https://www.drnote.co/api/pdf/mcqs/worker returns 401 without auth and matches `/api/pdf/mcqs/worker`.
[x] Vercel production env names are present for CRON_SECRET, CLERK_WEBHOOK_SIGNING_SECRET, CLERK_BILLING_*_PLAN, OpenRouter, R2, Convex, and Clerk.
[x] npm run build passed.
[ ] Clerk webhook delivery still has no real Billing event proof in Vercel logs from this workspace.
[ ] Deployed duplicate extraction script did not run because DEPLOYED_BASE_URL, DEPLOYED_TEST_PDF_PATH, and auth cookie/bearer were not set.
[ ] OpenRouter hard cap is still unset for the local key: /api/v1/key reports limit:null and usage:0.1990234.
```

## Done

```txt
[x] Clerk Billing pricing table exists on /pricing.
[x] Clerk webhook route exists and parses billing subscription events.
[x] Convex user plan, billing status, limits, usage periods, reservations, and audit-event tables exist.
[x] Quota preflight and reservation flow exists when QUOTA_ENFORCEMENT_ENABLED=true.
[x] Quota/rate-limit/billing errors surface as user-facing upgrade/manage-billing banners.
[x] trackedOpenRouter is wired for extraction, chat, grammar, and OCR paths when enabled.
[x] Budget warning audit events at 75% and 90% are implemented.
[x] Suspicious extraction cost guard hard-blocks unusual estimates.
[x] Convex-backed API rate-limit bridge exists, with local fallback for development.
[x] File-hash extraction cache and in-process duplicate suppression exist.
[x] Convex distributed extraction claim exists.
[x] Upload returns queued job status and the UI polls for results.
[x] Stale extraction job recovery cron exists.
[x] Original uploaded files can be stored through Convex/R2.
[x] Question source preview metadata is persisted through Convex questionSources.
[x] Source QA and source page-load unit tests exist.
[x] Manual source QA fixture matrix passes: `npm run test:source-qa-manual` reports 19/19.
[x] Ask mode retrieves local source chunks and Convex RAG chunks when indexed.
[x] DOC/DOCX/PPT/PPTX uploads are clearly rejected.
[x] Dashboard file list, study modes, quiz, mock exam, tutor, analysis, sessions, and upload UI exist.
[x] Dashboard usage popover now reads real monthly files/pages/chat usage from Convex.
[x] Production Vercel has `CLERK_WEBHOOK_SIGNING_SECRET` configured.
[x] Production Vercel has `CRON_SECRET` configured for secured cron worker calls.
[x] Production Vercel has explicit Clerk Billing plan slug env vars: starter, pro, max, teams.
[x] Convex Cron config exists for `/api/pdf/mcqs/worker` via `EXTRACTION_WORKER_URL`.
[x] Background worker route exists in the repo, is live in production, and can claim queued/stale Convex extraction jobs.
[x] Upload extraction no longer imports or calls Next `after()`; source persistence is required before a job is queued.
[x] Duplicate uploads now check active queued/processing jobs by file hash, plan mode, model, and user before creating a new job.
[x] Worker marks duplicate/cache-result jobs ready instead of leaving the claimed job processing.
[x] Internal cost report runs and returns cost, quota, rate-limit, duplicate, and source-failure signals.
[x] Internal dashboard and cost-report CLI exist.
[x] Sitemap, robots, OG image, global 404, and global error UI exist.
[x] Public copy avoids promising hidden or unfinished launch features.
[x] Lint, typecheck, production build, and core unit gates have documented passing runs.
```

## Partial

```txt
[~] Clerk Billing to Convex sync is coded, but real plan subscribe/cancel/past-due events are not production-verified.
[~] Paid-route authorization exists, but paid user lifecycle QA needs staging users.
[~] Duplicate-upload protection exists and now returns an immediate `inFlightHit` for an active matching job, but deployed multi-instance one-paid-call proof needs a successful authenticated live run.
[~] Convex-backed rate limits are wired and have live evidence, but production env must stay configured.
[x] Extraction uses the durable worker path in current code instead of Next after() for the initial request path.
[x] Large upload stuck-state risk is handled by requiring source persistence before queueing; if persistence fails, upload fails before creating a stuck job.
[~] Source browser has unit coverage, but real-PDF browser QA is still pending.
[~] Quiz pause/resume has localStorage implementation and unit tests, but needs browser QA with a real session.
[~] Convex deployment naming still needs launch-owner reconciliation. Clerk Billing plan slug env naming is now explicit in Vercel Production, but real Clerk Dashboard plan prices still need owner verification.
```

## Not Done / To Be Done

```txt
[ ] Verify Clerk webhook delivery with a real Clerk Billing event. The production secret exists, but delivery proof was not present in Vercel logs checked from this workspace.
[~] Verify Clerk Billing plan slugs/prices match Convex free/starter/pro/school quota profiles. Production env slugs are now explicit; actual Clerk Dashboard prices still require owner/dashboard verification.
[ ] Verify paid, canceled, and past-due quota behavior in staging.
[ ] Set OpenRouter hard spend caps for dev, staging, and production keys. Current local key reports `limit: null` and is not a management/provisioning key, so it cannot update its own cap through the OpenRouter API.
[ ] Re-run deployed duplicate extraction test with auth and confirm one paid OpenRouter call.
[ ] Complete manual source-browser QA with real user PDFs. Synthetic source QA fixtures pass, but this is not the same as real-PDF browser QA.
[ ] Verify source modal does not hang, crash, or loop 404s with real PDFs.
[ ] Verify deployed monthly AI/page/file/chat quota enforcement.
[ ] Verify deployed active extraction job limit by plan.
[ ] Verify deployed max pages per file limit.
[ ] Verify deployed max file size limit.
[x] Move extraction to a durable background worker path. Current code persists source first, queues a Convex job, triggers the secured worker, Convex Cron is configured, and the production worker endpoint is live.
[ ] Add R2/webp durable storage for source page preview images.
[ ] Verify Summary mode with real uploaded files.
[ ] Verify Download/export for questions, notes, and study material.
[ ] Verify Library organization and Sessions history across sessions/devices.
[ ] Verify Flashcards mode with real extracted files.
[ ] Verify Exam timing and final review behavior.
[ ] Verify Ask AI answers are grounded in uploaded-file source context.
[ ] Reconcile Vercel production NEXT_PUBLIC_CONVEX_URL deployment naming before first sale.
```

## Implemented This Pass

```txt
[x] Dashboard header usage button now queries api.users.getMyUsageDashboard.
[x] Usage panel now displays current-period files uploaded, pages processed, chat messages, and credit balance from Convex usagePeriods.
[x] Added a pipeline-safety regression test to keep the dashboard wired to current-period usage.
[x] Added `/api/pdf/mcqs/worker` secured by `CRON_SECRET`/`EXTRACTION_STORAGE_SECRET`.
[x] Added Convex Cron schedule for the worker.
[x] Added Convex `claimNextWorkerExtractionJob` and `by_status_updated` index.
[x] Added `CRON_SECRET` to Vercel Production.
[x] Added active extraction job lookup to prevent duplicate queued jobs.
[x] Removed Next `after()` from the upload extraction route.
[x] Added explicit `CLERK_BILLING_*_PLAN` env vars to Vercel Production.
```
