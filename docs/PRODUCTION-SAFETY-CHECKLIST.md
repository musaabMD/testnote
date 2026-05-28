# Production Safety Checklist

This is an internal launch gate. Do not expose margin or cost-control details in public UI.

## OpenRouter Key Caps

Set hard credit limits manually in OpenRouter before any paid beta traffic.

```txt
[ ] Development key has a low cap.
[ ] Staging key has a low cap.
[ ] Production key has a survivable cap.
[ ] Key caps are reviewed before increasing beta size.
```

## AI Runtime Defaults

```txt
[ ] MISTRAL_OCR_API_KEY is set.
[ ] MISTRAL_OCR_MODEL=mistral-ocr-latest
[ ] OPENROUTER_CHAT_MODEL=google/gemini-2.5-flash
[ ] OPENROUTER_AUTO_GRAMMAR_FIX=false
[ ] ENABLE_FULL_FILE_MULTIMODAL_FALLBACK=false
[ ] ENABLE_PDF_OCR_ROUTE=false
```

## Staging Verification Gate

```txt
[ ] Clerk Billing to Convex plan sync verified with real staging plans.
[ ] Deployed duplicate extraction lock verified against Vercel/staging.
[ ] Source browser QA passed with real PDFs.
[ ] npm run report:cost returns the expected cost, cache, duplicate, quota, and source failure signals.
[ ] Convex appAuditEvents contains quota, rate-limit, duplicate extraction, and source failure events.
[ ] OpenRouter hard cap is set for the active environment key.
```

## First Paid Private Beta Gate

Eligible only when all items below are green:

```txt
[ ] Paid user receives correct Convex limits automatically.
[ ] Canceled/past-due user cannot start expensive jobs.
[ ] Same deployed file uploaded concurrently produces one owner job and no duplicate paid OpenRouter call.
[ ] Same file uploaded repeatedly after success returns cache/in-flight signals.
[ ] Source modal does not hang, crash, or loop 404s.
[ ] Internal cost report can identify cost by user, feature, model, file, cache hit rate, duplicate charged files, quota failures, source failures, and low-margin users.
[ ] Full typecheck passes.
[ ] Full production build passes.
```

## After Private Beta Starts

```txt
[ ] R2 durable source previews/files.
[ ] Background extraction with Trigger.dev or Convex Workflow/Workpool.
[ ] Non-blocking upload job status.
[ ] Ask retrieval over chunks.
[ ] DOCX/PPTX conversion or explicit rejection.
[ ] Admin dashboard.
```
