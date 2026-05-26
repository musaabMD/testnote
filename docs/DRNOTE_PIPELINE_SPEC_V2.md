# DrNote Extraction Pipeline Spec V2

For agents: this is the migration target for TestNote extraction. Follow the phase order. Do not skip to billing or file-type expansion before page-level extraction is reliable.

## TestNote Delta

| Area | Current State | Migration Rule |
|---|---|---|
| AI provider | OpenRouter for extraction, chat, OCR, and grammar | Keep OpenRouter. Do not add direct Gemini. |
| Gemini SDK | Not installed | Do not install `@google/generative-ai` or `@google/genai`. |
| OpenRouter calls | Existing raw `fetch` wrappers and usage tracking | Any new SDK/client path must preserve `trackedOpenRouter` usage/cost logging. |
| Extraction runtime | Next route with `after()` and `maxDuration = 300` | Move heavy extraction to a long-running worker. Keep the route thin. |
| Cache | `fileHash + extractionMode + extractionModel + appExtractionVersion` | Extend early with prompt/schema/render versions. Do not replace blindly. |
| Resend | Already configured in `convex/emails.ts` | Wire job completion/failure emails. Do not rebuild Resend setup. |
| File types | PDF/images/text/markdown/RTF accepted; DOCX/PPTX rejected | New worker handles PDF first. Do not add DOCX/PPTX in Phase 1 or 2. |
| Progress | Coarse job polling | Add page audits and Convex realtime progress. |
| Storage | Convex/R2 source files and local preview fallback | Store page previews/crops in R2 and serve with signed URLs. Use base64 fallback only when needed. |

## Core Extraction Promise

Never silently drop a detected question. Every question-like block must become one of:

1. a complete extracted question,
2. an incomplete extracted question,
3. a `needs_review` question,
4. a regex fallback question marked `needs_review`.

## OpenRouter-Only AI

Use OpenRouter for all AI calls. Vision extraction should send a rendered page image plus extracted text.

Preferred image input order:

1. short-lived signed R2 URL for the WebP page image,
2. `data:image/webp;base64,...` fallback if the model/provider path cannot access signed URLs.

Use JSON output mode where supported:

```ts
response_format: { type: "json_object" }
```

This only guarantees JSON shape, not correctness. Zod validation and count checks are still mandatory. If OpenRouter/model support for JSON Schema is confirmed for the selected model, prefer schema-constrained output, but keep Zod as the final gate.

## Page Classification

Classify every page before AI calls:

```ts
type PageComplexity =
  | "text_selectable"
  | "normal_image"
  | "dense_image"
  | "noise";
```

Detection:

1. Extract selectable text with `pdfjs`.
2. Render the page image.
3. Run local image-region/entropy detection.
4. `text > 200 chars` -> `text_selectable`.
5. `regionCount > 5` -> `dense_image`.
6. `regionCount 1..5` -> `normal_image`.
7. `text < 50 chars && regionCount === 0` -> `noise`.

## Candidate Detection

Run deterministic regex before AI:

```ts
const englishPatterns = [
  /^\d+[\.\-\)]\s+/m,
  /^[A-E][\.\-\)]\s+/m,
  /^(Answer|His Answer|Correct Answer)\s*:\s*[A-E]/im,
  /which of the following/i,
  /most appropriate (management|next step|response)/i,
  /what is the (most|best|diagnosis|management)/i,
];

const arabicPatterns = [
  /^[أبجدهوزحطي]\.\s+/m,
  /الإجابة\s*:/,
  /الإجابة الصحيحة/,
  /أي مما يلي/,
  /ما هو|ما هي|ما هي أفضل/,
  /الأنسب|الأصح|الأكثر احتمالاً|الأكثر شيوعاً/,
];
```

Store `candidateQuestionCount`. The AI result must not be accepted with fewer questions unless retries and fallback have run.

## Extraction AI Contract

The extraction prompt must require:

- extract existing visible questions only,
- do not generate missing content,
- keep original wording,
- include incomplete questions,
- return top-to-bottom order,
- include normalized bbox `[ymin, xmin, ymax, xmax]`,
- include source quote under 20 words,
- set `hasImage` when a question contains a diagram/image.

Required response validation:

1. JSON parse succeeds.
2. Zod schema succeeds.
3. `questions.length >= candidateQuestionCount` unless fallback creates review items.
4. answer label exists in options.
5. bbox is valid and normalized.
6. source quote fuzzy-matches page text when text is available.

## Retry Strategy

1. Level 1: retry same page/image with stronger prompt and candidate count.
2. Level 2: crop likely missed region and retry the crop.
3. Level 3: escalate to `google/gemini-2.5-flash` through OpenRouter.
4. Final fallback: create regex-derived `needs_review` records.

No detected candidate may disappear at the end of this chain.

## Data Additions

Add page-level data alongside existing tables:

- `pages`: page index, text, preview key, complexity, PU cost, mode, candidate count, status.
- `virtualSubPages`: dense-page crop records.
- `sourceBlocks`: deterministic or AI-detected blocks.
- `questions`: extracted/generated questions with source refs and optional question image key.
- `pageAudits`: per-page candidate/extracted/generated/retry counts and warnings.

Extend existing job records rather than abruptly deleting them. Once no compatibility path is needed, old fields can be removed in a later cleanup.

## Cache Key

Extend the existing cache key in Phase 1:

```ts
type ExtractionCacheKey = {
  fileHash: string;
  extractionMode: ExtractionMode;
  extractionModel: string;
  appExtractionVersion: string;
  promptVersion: string;
  schemaVersion: string;
  renderVersion: string;
};
```

Any change to extraction logic, prompt, schema, model, or render settings must bust cache.

## Worker Target

Move heavy PDF work to a Node worker:

1. claim pending job in Convex,
2. download original from R2,
3. render/extract/classify pages,
4. reserve PU,
5. run deterministic scan,
6. call OpenRouter page-by-page,
7. validate and retry,
8. write questions/audits,
9. charge/refund PU,
10. send Resend notification.

The Next route should eventually only authenticate, hash, upload, create job, and return `202`.

## Emails

Use existing Resend setup:

- all passed: "Your N questions are ready",
- needs review: "N questions ready, M need review",
- failed: "We couldn't process fileName",
- low PU balance: "Running low on processing credits".

## Build Order

### Phase 1: Extraction Reliability

1. Extend cache key with prompt/schema/render versions.
2. Add page-level Convex schema.
3. Add worker scaffold and job claim loop.
4. Add page preprocessor: text, render, complexity.
5. Add deterministic candidate scan.
6. Add OpenRouter page extraction.
7. Add Zod validation and count check.
8. Add Level 1 retry.
9. Add page audits and realtime progress.
10. Wire completion/failure emails.

### Phase 2: Completeness

1. Add crop retry.
2. Add stronger-model retry.
3. Add regex fallback `needs_review`.
4. Add question image extraction.
5. Add dense-page sub-page splitting.
6. Add signed URL source viewer path.
7. Add review queue.
8. Add Arabic regex support.

### Phase 3: Billing And Generation

1. Add PU reservation/charge/refund fields.
2. Add study-content generation.
3. Add Stripe PU packs.
4. Add daily PU limits.
5. Add low-balance email.

### Phase 4: Scale

1. Worker horizontal scaling.
2. DOCX/PPTX via LibreOffice, only if requested by users.
3. Daily COGS monitoring.
4. Kill switch dashboard.

## Do Not Do

- Do not use direct Gemini.
- Do not install Gemini SDKs.
- Do not bypass OpenRouter usage tracking.
- Do not trust `json_object` without Zod.
- Do not accept fewer extracted questions than deterministic candidates without retry/fallback.
- Do not process heavy PDFs in Next routes long-term.
- Do not build DOCX/PPTX in Phase 1 or 2.
- Do not rebuild Resend.
- Do not drop existing billing/cache tables during the migration.
