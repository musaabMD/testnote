# Performance And Efficiency Plan

Created: 2026-05-27

This document is a planning artifact only. It does not approve or implement code changes. Use it to baseline the current app, agree target metrics, then make small measured corrections.

## Implementation Status

- 2026-05-27: Added opt-in Web Vitals reporting behind `NEXT_PUBLIC_ENABLE_WEB_VITALS_REPORTING=true`.
- 2026-05-27: Added `Server-Timing` headers and optional structured upload timing logs for `POST /api/pdf/mcqs`.
- 2026-05-27: Added `npm run report:performance` to write `.qa/performance-baseline.json`.

## Scope

Improve efficiency across:

- App and site speed: first load, route transitions, bundle size, server response time, Core Web Vitals.
- Upload speed: browser upload, server parsing, source-file storage, job start latency, progress feedback.
- Convex efficiency: query/action latency, index usage, document reads/writes, storage payload size, queue behavior.
- AI extraction cost: estimated and actual cost per page, per file, per generated question, duplicate extraction rate.
- UI and UX: perceived latency, loading states, error recovery, mobile ergonomics, accessibility, completion rate.
- Reliability: extraction success rate, stuck jobs, retries, failure classification, operational alerts.

## Non-Goals

- Do not change product behavior until baseline metrics exist.
- Do not reduce extraction quality to improve speed without measuring question accuracy.
- Do not remove quota, rate-limit, audit, or billing safety checks.
- Do not optimize only local development metrics; production data is the decision source.

## Current System Notes

- App framework: Next.js 16.2.6 App Router, React 19.2.4.
- Backend/state: Convex with R2, workflow, RAG, rate limiter, Stripe, Resend, PostHog.
- Upload route: `src/app/api/pdf/mcqs/route.ts` accepts multipart files, reads the full file into memory, hashes it, counts pages, persists the source file, reuses an active duplicate job when present, then queues durable worker extraction.
- Worker route: `src/app/api/pdf/mcqs/worker/route.ts` claims queued jobs and processes source files from storage.
- Client upload flow: `src/lib/process-pdf-upload.ts` uploads one supported file at a time, polls `/api/pdf/mcqs/jobs/[jobId]`, then saves local queue state and indexes RAG chunks.
- Existing measurement scripts:
  - `npm run report:bundle`
  - `npm run report:cost`
  - `npm run test:pipeline-safety`
  - `npm run test:source-qa`

## Baseline Before Any Fixes

Record these numbers before implementing changes. Store snapshots under `.qa/` or another agreed QA folder.

| Area | Metric | Current | Target | Source |
| --- | --- | ---: | ---: | --- |
| Web vitals | LCP p75 mobile | TBD | <= 2.5s | Vercel Analytics or `useReportWebVitals` |
| Web vitals | INP p75 mobile | TBD | <= 200ms | Vercel Analytics or `useReportWebVitals` |
| Web vitals | CLS p75 mobile | TBD | <= 0.10 | Vercel Analytics or `useReportWebVitals` |
| Server | Home TTFB p75 | TBD | <= 800ms | Vercel function metrics |
| Server | Dashboard TTFB p75 | TBD | <= 1.0s | Vercel function metrics |
| Bundle | First-load JS for `/` | TBD | <= 180 KB gzip goal | `npm run build`, `npm run report:bundle`, Next analyzer |
| Bundle | Largest client chunk | TBD | <= 120 KB gzip goal | Next analyzer |
| Upload | Time to 202 for 10 MB PDF | TBD | <= 4s p75 | Browser timing + API logs |
| Upload | Time to 202 for 100 MB PDF | TBD | <= 15s p75 | Browser timing + API logs |
| Upload | Server memory per upload | TBD | No OOM / stable p95 | Vercel runtime metrics |
| Extraction | Queue wait p75 | TBD | <= 30s | Convex `extractionJobs` timestamps |
| Extraction | End-to-end time per page p75 | TBD | <= 8s | Job timestamps |
| Extraction | Failure rate | TBD | <= 2% | `extractionJobs.failureReason` |
| Extraction | Stuck job rate | TBD | 0 active stale jobs | `by_status_updated` index |
| Convex | Dashboard query p75 | TBD | <= 250ms | Convex logs/metrics |
| Convex | Job poll query p75 | TBD | <= 150ms | Convex logs/metrics |
| Convex | Reads per dashboard load | TBD | Decrease after baseline | Convex metrics |
| Convex | Writes per extraction job | TBD | Decrease after baseline | Convex metrics |
| Cost | AI cost per extracted page | TBD | Plan-specific budget | `npm run report:cost` |
| Cost | AI cost per successful file | TBD | Plan-specific budget | `npm run report:cost` |
| Cost | Duplicate extraction rate | TBD | < 1% | `fileCache`, `extractionJobs.by_extraction_key` |
| UX | Upload completion rate | TBD | >= 95% | Product analytics |
| UX | User-visible recoverable failures | TBD | Decrease after baseline | Audit/error events |

## Measurement Commands

Run these during baseline and after every optimization phase:

```bash
npm run build
npm run report:performance
npm run report:bundle
npm run report:cost
npm run test:pipeline-safety
npm run test:source-qa
npx tsc --noEmit
```

For deeper bundle analysis on Next.js 16:

```bash
npx next experimental-analyze --output
```

For upload and extraction timing, add temporary QA logging or export a report from existing tables instead of judging by manual observation.

## Highest-Risk Bottlenecks To Validate

### 1. Uploads are routed through the Next.js server

The current upload route reads the full multipart `File` into memory with `file.arrayBuffer()`. This is simple and safe for validation, but it can increase server memory, cold-start cost, upload latency, and failure rate for large files.

Correction direction:

- Move large-file transfer to direct client-to-R2 or Convex storage using a signed upload flow.
- Send only metadata, object key, hash, size, and extraction options to the Next route.
- Keep the current server upload path as a small-file fallback until direct upload is proven.
- Measure time-to-queued and server memory before removing the fallback.

### 2. Background extraction runs through the worker path

The worker route claims queued jobs from storage and Convex Cron calls it every two minutes for recovery. The upload route no longer uses Next `after()` as the primary extraction path.

Correction direction:

- Use the request route primarily for validation and enqueueing.
- Let the worker path process durable jobs.
- Add stale-job repair and retry rules based on `status` and `updatedAt`.

### 3. Client upload processes files serially

`processPdfUploads` loops through supported files one at a time. Serial processing protects quotas and avoids resource spikes, but it slows multi-file upload batches.

Correction direction:

- Keep extraction concurrency limited by plan and active job limits.
- Allow parallel source upload for small files, then queue extraction jobs separately.
- Add a batch progress model: uploading, queued, processing, finalizing, ready.
- Avoid starting too many AI extractions at once.

### 4. Duplicate work must stay near zero

The schema has `fileCache`, `pdfExtractionRecords`, `extractionJobs.by_extraction_key`, and `sourceFiles.by_clerk_user_file_hash`. These should prevent duplicate extraction, storage, and billing.

Correction direction:

- Report cache hit rate by extraction key.
- Fail fast when an equivalent ready extraction exists.
- Make queued/processing duplicate detection visible in the UI as "already processing".
- Verify duplicate uploads do not call OpenRouter.

### 5. Client bundle may include heavy PDF and study UI code

The home page dynamically imports the upload dropzone. Study surfaces import many icons and feature components. `pdfjs-dist`, markdown, assistant UI, and PDF tools should not leak into routes that do not need them.

Correction direction:

- Use Next analyzer to inspect client imports by route.
- Keep PDF parsing, OCR, extraction, and large validation utilities server-only where possible.
- Split large study modes into dynamic chunks by selected mode.
- Check icon imports and large UI libraries for unnecessary client reach.

## Correction Plan

### Phase 0: Baseline And Guardrails

- Capture the metric table above.
- Save bundle analysis output from `npx next experimental-analyze --output`.
- Save cost report from `npm run report:cost`.
- Create a small upload benchmark set: 1 MB text, 10 MB PDF, 100 MB PDF, scanned PDF, image-only file, duplicate file.
- Confirm quota preflight blocks do not call OpenRouter.
- Confirm current worker cron can process a queued job without the original request staying alive.

Exit criteria:

- Baseline numbers are written down.
- The team agrees which three metrics are the first targets.
- Existing tests pass before any implementation.

### Phase 1: Quick Wins With Low Blast Radius

- Add production web-vitals reporting with a tiny isolated client component if current analytics does not expose LCP, INP, CLS, FCP, and TTFB by route.
- Add server-side timing marks for upload phases: form parse, hash, page count, source storage start, job create, response sent.
- Add extraction job timing fields or derived report: queuedAt, processingAt, readyAt, failedAt.
- Add a scheduled stale-job report for jobs stuck in `queued` or `processing`.
- Keep user-facing loading states tied to real job progress when possible, not only simulated phases.

Expected impact:

- Better decisions, fewer blind optimizations, faster incident triage.

Risk:

- Low if metrics are sampled and do not log file contents or user private data.

### Phase 2: Upload Path Efficiency

- Design direct upload for large files:
  - Browser requests upload permission and limits.
  - Server returns signed storage target.
  - Browser uploads file directly.
  - Browser sends object metadata to enqueue extraction.
  - Worker downloads from storage for extraction.
- Keep existing multipart route for small files until direct upload is stable.
- Compute file hash in the browser for duplicate detection when practical; otherwise compute in worker after upload.
- Show upload byte progress separately from extraction progress.
- Add resumable upload only if real production failures justify it.

Expected impact:

- Lower server memory.
- Faster time-to-queued for large files.
- Lower Vercel function cost and fewer request body failures.

Risk:

- Medium. Requires careful auth, object ownership, size limits, MIME validation, and cleanup of abandoned uploads.

### Phase 3: Durable Extraction Pipeline

- Make the durable worker the primary extraction path.
- Decide whether Convex Workflow/Workpool should replace the current secured worker endpoint for deeper orchestration.
- Add retry policy by `failureReason`:
  - Retry transient storage/network/model errors.
  - Do not retry quota, unsupported type, or validation errors.
- Add queue depth and worker throughput reports.
- Ensure job claim is atomic and idempotent.
- Add "already queued" and "already ready" behavior for duplicate extraction keys.

Expected impact:

- Fewer stalled uploads.
- More predictable large-file extraction.
- Better cost control.

Risk:

- Medium. Needs tests for duplicate claims, stale jobs, and retries.

### Phase 4: Convex Efficiency

- Audit every dashboard and job-poll query for index usage.
- Prefer narrow query results for list views; fetch heavy payloads only on detail screens.
- Avoid storing large extraction payloads directly in frequently read documents when R2 payload storage is available.
- Add pagination or cursor limits to file/session/history views.
- Denormalize small display fields only when it removes repeated fan-out reads.
- Batch writes for progress updates where possible; do not write every tiny progress change if users cannot perceive it.

Expected impact:

- Lower Convex read/write volume.
- Faster dashboard load and polling.
- Lower backend cost.

Risk:

- Medium if schema changes are needed; low for query narrowing.

### Phase 5: Site Speed And Bundle Reduction

- Run Next analyzer and inspect client chunks for `/`, `/dashboard`, and study routes.
- Split study tools by mode so exam, flashcards, review, summary, and ask panels do not all load upfront.
- Keep PDF.js and file-processing code out of routes that only list existing files.
- Review font usage. The root layout loads Geist, Geist Mono, Sora, and DM Sans; confirm all are necessary for production.
- Use static shells and Suspense for request-time dashboard data where compatible with the current Next.js 16 caching model.
- Add image dimension stability and avoid layout shifts around logos, previews, and generated media.

Expected impact:

- Better LCP and INP.
- Lower first-load JS.
- Faster route transitions.

Risk:

- Low to medium. Splitting large client components can introduce loading-state bugs if not tested.

### Phase 6: UX And Accessibility

- Replace simulated upload progress with real upload bytes and real extraction job progress wherever possible.
- Preserve user control during long extraction: background processing, dismissible progress, retry, cancel where supported.
- Improve error recovery per failure type: quota, unsupported type, too large, source missing, model failure, OCR failure.
- Check keyboard and screen-reader flow for dropzone, dialogs, popovers, tabs, and study mode controls.
- Add mobile checks for upload, dashboard, source preview, quiz, and exam flows.

Expected impact:

- Higher upload completion rate.
- Fewer support tickets.
- Better perceived performance even when extraction is inherently slow.

Risk:

- Low if changes are incremental and verified in browser.

### Phase 7: Cost Controls

- Track estimated vs actual model cost per job.
- Report cost per page, per file, per generated question, per user plan, and per extraction mode.
- Add budget alerts before hard blocks.
- Cache successful extraction outputs by complete extraction key.
- Use cheaper/faster extraction paths for text-selectable PDFs when quality tests pass.
- Reserve expensive OCR/model calls for scanned or dense pages.
- Add anomaly detection for small files with unusually high cost per page.

Expected impact:

- Lower AI spend.
- Better plan limits.
- Fewer surprise cost spikes.

Risk:

- Medium. Any model-routing change must be checked against source QA and extraction accuracy.

## Recommended Priority Order

1. Baseline metrics and reports.
2. Upload timing instrumentation.
3. Durable worker-first extraction.
4. Duplicate extraction and cache-hit reporting.
5. Direct-to-storage upload for large files.
6. Bundle split for study routes.
7. Convex query narrowing and pagination.
8. Cost-aware extraction routing.

## Acceptance Checklist For Each Optimization

- Baseline metric exists before the change.
- Target metric improves or stays neutral.
- Extraction quality tests still pass.
- Quota and duplicate-extraction tests still pass.
- No private file content is added to logs.
- Rollback path is clear.
- User-facing loading and error states still make sense.

## Suggested New Reports

- `upload-performance-report`: p50/p75/p95 time-to-queued, upload bytes, file type, file size bucket, failure reason.
- `extraction-queue-report`: queued, processing, ready, failed, stale, retry count, worker throughput.
- `convex-efficiency-report`: slowest queries/actions, documents read/written, payload bytes, missing index candidates.
- `ai-cost-quality-report`: model, mode, page count, question count, cost, retry count, QA warnings.
- `web-vitals-report`: route, device class, LCP, INP, CLS, FCP, TTFB, build id.

## Safety Notes

- Large-file optimization should not bypass Clerk ownership checks, quota preflight, MIME validation, file size limits, or audit events.
- Storage object keys must remain environment-scoped and owner-scoped.
- Any worker retry must be idempotent to avoid duplicate OpenRouter calls or duplicate billing.
- Any bundle split must keep critical upload and dashboard flows easy to test.
- Any cost reduction must be validated against medical/exam question quality, not only token spend.
