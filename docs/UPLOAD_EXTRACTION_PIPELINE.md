# Upload Extraction Pipeline Rules

This file is the operating contract for uploaded-file extraction. Use it before
changing upload, OCR, cache, job, worker, quota, or study-file storage code.

## Goal

The same physical file, under the same extraction configuration, must not create
two paid extraction runs.

It may create or refresh cheap metadata, source-file storage, local UI progress,
or polling state. It must not create another OCR/OpenRouter extraction unless the
extraction key changes or the old job is stale/retryable.

## Canonical IDs

`fileHash` is the SHA-256 of the uploaded bytes. It is the stable file identity.
Do not use filename, timestamp, browser queue id, or display title for dedupe.

`extractionKey` is the paid-work identity:

```txt
fileHash
extractionMode
extractionModel
appExtractionVersion
promptVersion
schemaVersion
renderVersion
```

Owned in code by `src/lib/extraction-config.ts`.

Only these fields should decide whether an extraction result can be reused. Bump
the relevant version when extraction behavior changes:

- `APP_EXTRACTION_VERSION` for parser/orchestration behavior.
- `EXTRACTION_PROMPT_VERSION` for prompt changes.
- `EXTRACTION_SCHEMA_VERSION` for response/result shape changes.
- `EXTRACTION_RENDER_VERSION` for PDF rendering/source-region changes.

## Fast Path Order

The upload route should stay thin and deterministic:

1. Validate rate limit, file type, and server upload size.
2. Buffer the file once and compute `fileHash`.
3. Count pages as cheaply as possible.
4. Run quota preflight without reserving final extraction cost.
5. Persist the source file for signed-in durable worker access.
6. Build `extractionKey`.
7. Atomically claim or reuse a queued/processing Convex job for that key.
8. Return `202` with the existing or new `jobId`.
9. Let the worker claim queued work and run extraction.
10. Poll `GET /api/pdf/mcqs/jobs/[jobId]` until a persisted result is ready.

Heavy parsing, OCR, AI calls, retries, source previews, and result persistence
belong behind the worker/extractor boundary, not in the upload request.

## Dedupe Layers

Use all layers. They protect different failure modes.

| Layer | Purpose | Owner |
|---|---|---|
| Client queue replace by `fileHash` | One visible study file per uploaded bytes | `src/lib/process-pdf-upload.ts` |
| Source-file upsert by user + `fileHash` | Store original bytes without multiplying visible files | `convex/sourceFiles.ts` |
| Upload job claim by `extractionKey` | Cross-instance duplicate upload protection | `claimQueuedExtractionJobForUpload` |
| In-process promise map by `extractionKey` | Same Node process double-click protection | `runPdfMcqExtraction` |
| Distributed extraction claim by `extractionKey` | Cross-instance extractor protection | `claimDistributedExtraction` |
| File cache by full cache key | Reuse completed extraction result | `fileCache` / `.data/extraction-cache` |

Source-file storage may be repeated because it is cheap and idempotent. OCR and
OpenRouter extraction should happen only after the job/cache/lock checks pass.

## Duplicate Decision Table

| Situation | Response |
|---|---|
| Same `extractionKey`, job queued/processing and not stale | Return existing `jobId`, `inFlightHit: true`; do not start paid work. |
| Same `extractionKey`, cache exists | Return cached extraction or mark job ready from persisted result. |
| Same `extractionKey`, previous permanent failure | Return failed state until file/config changes. |
| Same `extractionKey`, previous transient failure after cooldown | Allow one new job claim. |
| Same `fileHash`, different mode/model/version | Treat as a new extraction key and allow work. |
| Same filename, different bytes | Treat as a different file. |
| Different filename, same bytes | Reuse by `fileHash`; keep latest display name only where UI needs it. |

## Extraction Rules

- Mistral OCR is the primary extraction path for PDFs and images.
- Deterministic parsing should run before model fallback.
- OpenRouter is for chat, summaries, grammar, repair/fallback, and assistant
  flows; it should not become the default uploaded-file extraction path.
- Full-file multimodal fallback stays opt-in through
  `ENABLE_FULL_FILE_MULTIMODAL_FALLBACK`.
- Every OpenRouter call must go through tracked usage wrappers so Convex receives
  cost, token, reservation, and audit data.
- Never accept fewer extracted questions than deterministic candidates without a
  retry, a `needs_review` fallback, or an explicit failure reason.

## Job State Rules

`extractionJobs` is the durable coordination record.

- `queued`: upload accepted; worker may claim it.
- `processing`: worker/extractor owns it; duplicates should wait or poll.
- `ready`: result must exist in `pdfExtractionRecords` or cache.
- `failed`: response must include a user-facing error and `failureReason`.

Worker recovery may reclaim stale `queued` or `processing` jobs. The stale
timeout must be longer than normal worker progress updates so active jobs are not
double-claimed.

If a worker has already claimed a job, the extractor must not wait on itself. A
same-`jobId` extraction call is ownership continuation, not a duplicate waiter.

## Persistence Rules

Persist these separately:

- Original source bytes: `sourceFiles` / R2, keyed by user and `fileHash`.
- Reusable extraction result: `fileCache`, keyed by full `extractionKey`.
- User-visible completed file result: `pdfExtractionRecords`, keyed by user and
  `fileHash`.
- Worker coordination: `extractionJobs`, keyed by `jobId` and indexed by
  `extractionKey`.
- Page/source diagnostics: `extractionPages`, `extractionPageAudits`,
  `questionSources`.

Production extraction must use Convex storage. Local `.data` storage is for
development only.

## Change Checklist

Before changing the pipeline:

1. Identify whether the change affects file identity, extraction identity, job
   orchestration, source storage, or parsing quality.
2. If output behavior changes, bump the correct extraction version in
   `src/lib/extraction-config.ts`.
3. Preserve the upload route contract: fast `202`, `jobId`, `fileHash`,
   `pageCount`, and polling.
4. Verify duplicates return the same active job or cache result.
5. Verify quota blocks happen before paid model calls.
6. Verify failures produce `failureReason` and do not leave jobs permanently
   stuck in `processing`.
7. Keep audit events for duplicate owners/waiters, quota blocks, source failures,
   and suspicious cost blocks.

Useful checks:

```bash
npm run test:pipeline-safety
npm run test:extraction-failure
npm run test:deployed-duplicate-extraction
npm run report:cost
```

The deployed duplicate smoke still needs a real signed-in paid session plus
OpenRouter usage review to prove only one paid call across Vercel instances.

## Primary Files

- `src/app/api/pdf/mcqs/route.ts`: upload validation, hashing, source storage,
  job claim, worker trigger.
- `src/app/api/pdf/mcqs/worker/route.ts`: queued job claim, source download,
  extraction execution.
- `src/app/api/pdf/mcqs/jobs/[jobId]/route.ts`: polling and result recovery.
- `src/lib/extraction-config.ts`: extraction cache key and version constants.
- `src/lib/extraction-job-store.server.ts`: job and persisted result access.
- `src/lib/distributed-extraction-lock.server.ts`: extraction lock client.
- `src/lib/extraction-cache.server.ts`: reusable result cache.
- `src/lib/pdf-extraction.server.ts`: OCR/parser/model extraction pipeline.
- `convex/extractionStorage.ts`: job/cache/extraction/page storage mutations.
- `convex/sourceFiles.ts`: durable original source-file storage.
