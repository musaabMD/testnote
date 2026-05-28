# DrNote UX Wow Effects

Purpose: define high-impact product moments that make upload, extraction, review, and study feel unusually fast and polished without lying about progress or fabricating study content.

## Principles

- Show real progress within 3 seconds.
- Never pretend extraction is complete before it is.
- Let users leave the upload screen while work continues.
- Make slow work feel active, specific, and recoverable.
- Reward every successful upload with an immediate next action.
- Keep the interface calm. The "wow" should come from speed, confidence, and usefulness, not decoration.

## North Star Experience

User uploads a PDF and sees a useful result in under 3 seconds:

1. Upload is accepted immediately.
2. The app shows file name, page count, detected language, and a first progress state.
3. If cache, deterministic text, or quick page scan is available, show a real preview question/source snippet.
4. Extraction continues in the background.
5. User can continue browsing library, open another file, or start reviewing partial results as they arrive.
6. When complete, the app transitions into Quiz, Exam, Flashcards, or Analysis without forcing a refresh.

## Timing Targets

| Moment | Target | User sees |
|---|---:|---|
| File accepted | < 500 ms | Upload row appears with "Queued" or "Checking file" |
| First meaningful state | < 1 sec | Page count, file hash/cache check, or validation result |
| First useful result | < 3 sec | Cached questions, page preview, extracted text snippet, or "first pages scanning" status |
| Background job visible | < 3 sec | Persistent job card/toast with percent, current phase, and safe navigation |
| Partial study unlock | 5-20 sec | First completed questions can be reviewed while remaining pages process |
| Completion handoff | Immediate after job done | Ready CTA: Quiz, Exam, Flashcards, Source Review |

## Upload Wow Effects

### 1. Instant Upload Receipt

As soon as the browser accepts the file, show a compact receipt:

- File name.
- Size.
- Page count when known.
- Detected type.
- Account quota impact.
- "Safe to leave this page" once the server job exists.

Acceptance criteria:

- The receipt appears before AI extraction starts.
- Validation failures replace the receipt with a clear fix.
- Duplicate uploads show "Already processing" or "Using previous result" instead of creating anxiety.

### 2. Three-Second First Result

Within 3 seconds, show the best real result available:

- Cache hit: show ready question count and open the file immediately.
- Fast deterministic scan: show detected question count estimate and first source snippet.
- Page preview ready: show the first page thumbnail with scanning overlay.
- No result yet: show exact phase, for example "Reading page text" or "Rendering page 4".

Do not show fake questions, fake percentages, or AI-generated placeholders.

### 3. Progressive Extraction

Unlock completed pages before the whole file finishes:

- "12 questions ready, 38 still processing."
- Allow Review mode for ready questions.
- Keep Exam mode locked until the full job finishes, unless user explicitly chooses a partial exam.
- Mark low-confidence or regex fallback items as "Needs review".

### 4. Background Continuation

After upload is accepted, the user can:

- Navigate to dashboard.
- Upload another file.
- Close the modal.
- Return later and see the same job state.
- Receive completion or failure email when enabled.

The persistent job card should include:

- Status: queued, scanning, extracting, reviewing, ready, failed.
- Current phase.
- Pages processed.
- Questions found.
- Retry/recovery message when a worker stalls.
- CTA for ready result or failure recovery.

## Study Wow Effects

### 5. First Action Recommendation

When extraction completes, choose the best next action automatically:

- Many MCQs with answers: "Start Quiz".
- Timed exam-looking file: "Start Exam".
- Weak answers or missing answer key: "Review flagged questions".
- Dense notes with few MCQs: "Generate flashcards" only if that feature is genuinely ready.

### 6. Source Confidence Moment

Every question should feel grounded:

- One-click source preview.
- Highlighted source region when available.
- Short source quote under each explanation or review panel.
- "Needs review" when source confidence is weak.

This is a trust-building wow effect. It matters more than animation.

### 7. Resume Where I Left Off

When a user returns:

- Continue last quiz session.
- Show recent files with ready/processing/failed states.
- Surface unfinished jobs first.
- Preserve bookmarks, wrong answers, and progress.

### 8. Smart Recovery

Failures should create useful paths:

- Unsupported DOCX/PPTX: explain "Export to PDF" and keep the upload slot clean.
- Rate limit: show when to retry.
- Quota limit: show plan-aware upgrade/retry path.
- Extraction failure: allow retry, source review, or support handoff with job ID.

## Background Work Requirements

Minimum viable background behavior:

- Upload route returns `202` quickly with `jobId`.
- Client polls job status and survives navigation.
- Job state is stored durably in Convex.
- Stale jobs recover or fail with a clear message.
- Cache hits bypass AI calls and open quickly.

Target behavior:

- Worker processes pages incrementally.
- Convex realtime progress replaces coarse polling.
- Page previews and source crops are stored durably.
- Completion/failure emails use the existing Resend path.
- Partial results become available before full completion.

## Instrumentation

Track these events:

- `upload_selected`
- `upload_validated`
- `upload_job_created`
- `first_progress_visible`
- `first_useful_result_visible`
- `partial_results_visible`
- `job_completed`
- `job_failed`
- `result_opened`
- `quiz_started_after_upload`

Core metrics:

- Time to upload receipt.
- Time to first useful result.
- Time to first ready question.
- Time to full completion.
- Cache hit rate.
- Duplicate upload reuse rate.
- Job failure rate by reason.
- Percent of users who start studying within 60 seconds of upload.

## UI Copy Patterns

Use specific phase text:

- "Checking file"
- "Counting pages"
- "Looking for questions"
- "Reading page 3 of 18"
- "12 questions ready"
- "Still working in the background"
- "Ready to review"
- "Needs review"

Avoid vague or risky copy:

- "Almost done" unless completion is actually near.
- "AI is thinking" for deterministic parsing work.
- "Generating questions" when the product is extracting existing questions.
- "100%" before the result is saved and openable.

## Rollout Plan

### Phase 1: Fast Honest Upload

- Instant upload receipt.
- 3-second first meaningful state.
- Persistent background job card.
- Clear duplicate/cache states.

### Phase 2: Partial Results

- Page-level progress.
- First ready questions unlock review mode.
- Needs-review labeling.
- Source confidence preview.

### Phase 3: Proactive Continuation

- Email on ready/failure.
- Dashboard job center.
- Resume CTA on return.
- Smart next action after completion.

## Definition Of Done

- A normal user understands within 3 seconds that the file is accepted and work is happening.
- A cached upload opens almost immediately.
- A slow upload can continue in the background without trapping the user.
- A failed upload explains what happened and what to do next.
- No UI state implies finished extraction until a saved result is available.
- Product analytics can measure the full path from upload to first study action.
