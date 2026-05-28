# TestNote Publish Readiness Checklist

Audit date: 2026-05-28

## Overall Status

Current verdict: live for public demo traffic, not ready for paid production launch.

Estimated readiness:

- Public demo / staging preview: 90%
- Private beta with manual monitoring: 70%
- Paid production launch: 55%

Main reason: the app is deployed at `https://www.drnote.co` and core build/runtime gates pass, but production Clerk Billing to Convex verification, paid-session duplicate-charge proof, OpenRouter hard caps, and production support operations still need owner/dashboard validation.

## Verified Today

```txt
[x] TypeScript check passes: npx tsc --noEmit
[x] Source QA tests pass: npm run test:source-qa
[x] Pipeline safety tests pass: npm run test:pipeline-safety
[x] Extraction failure tests pass: npm run test:extraction-failure
[x] Production build passes: npm run build
[x] Production server starts from built output: npm run start -- -p 3010
[x] Public routes smoke-tested: /, /features, /pricing, /exams, /support return 200
[x] Protected routes redirect without auth: /dashboard, /pdf, /dashboard/content/study return 307
[x] Configured lint gate passes: npm run lint
[x] App-only lint warning surface is clean through the configured lint gate
[x] Bundle report runs: npm run report:bundle
[~] Lighthouse baseline saved to .qa/lighthouse-home.json; performance/best-practices are not passing yet
[x] Internal cost report runs: npm run report:cost
[~] Deployed duplicate extraction test runs against `https://www.drnote.co`; anonymous requests correctly stop at 402 before OpenRouter, but production Clerk does not allow backend-created sessions, so paid-session proof still requires a real live browser session cookie.
[x] Live production deploy ready and aliased: `dpl_3vFK1RG5pV8ckjkrvP9eH6ozFcZ3` / `https://www.drnote.co`
[x] Live unsupported DOCX upload returns 400 with clear user-facing copy.
```

## Feature Readiness

### Public Site

```txt
[x] Landing page exists with upload entry point.
[x] Features page exists.
[x] Pricing page exists.
[x] Pricing renders Clerk Billing and links support through /support.
[x] Public support route exists: /support.
[x] SEO basics exist: global metadata, route metadata, sitemap, robots, and OG image are present.
```

### Authentication

```txt
[x] Clerk middleware protects /dashboard and /pdf routes when Clerk env is configured.
[x] App can run locally without Clerk for development.
[~] Paid-route authorization still needs production verification with real Clerk users.
```

### Upload and Extraction

```txt
[x] Upload and paste UI exists.
[x] PDF/image/text/RTF upload path exists; DOC/DOCX/PPT/PPTX are explicitly rejected.
[x] AI extraction route exists: /api/pdf/mcqs.
[x] File hash cache and in-process duplicate suppression exist.
[x] Convex distributed extraction claim exists.
[x] Upload job creation now uses the Convex extraction-key claim, so rapid duplicate uploads return the existing queued/processing job instead of creating a second queued job.
[x] Full-file multimodal fallback is disabled by default.
[x] OCR route is disabled by default outside explicit env.
[x] Extraction returns queued status and polling, persists source before queueing, and runs through the secured durable worker path instead of Next after().
[x] DOC/DOCX/PPT/PPTX rejection is shared across UI and server upload paths.
```

### Study Experience

```txt
[x] Dashboard file list exists.
[x] Study modes exist: flashcards, quiz, review, exam, summary, ask.
[x] Quiz and mock exam UI exist.
[x] Tutor/chat UI exists.
[x] Question source preview infrastructure exists.
[~] Source browser has unit coverage but still needs manual browser QA with real PDFs.
[~] Ask mode uses local chunks plus Convex RAG search when indexed; real uploaded-file grounding QA is still pending.
```

### Billing and Plans

```txt
[x] Clerk Billing pricing table exists.
[x] Convex user plan/limit fields exist.
[x] Quota preflight/reservation flow exists when quota enforcement is enabled.
[~] Clerk Billing plan slugs/prices are not verified against Convex plan limits in staging.
[~] Paid/canceled/past-due behavior needs staging verification.
[ ] Clerk Billing production configuration is not verified.
```

### Safety, Cost, and Abuse Controls

```txt
[x] trackedOpenRouter is wired for extraction/chat/grammar/OCR route paths.
[x] Usage ledger tables and quota reservation tests pass.
[x] Convex Rate Limiter bridge exists for protected expensive routes.
[x] Audit events exist for quota/rate/source/duplicate signals.
[~] Convex-backed limits need deployed shared-instance verification.
[~] Suspicious extraction cost guard hard-blocks unusual estimates; thresholds are not calibrated with production data.
[x] Budget warning events at 75% and 90% are implemented.
[x] Internal cost report runs with deployed Convex credentials and usage secrets.
```

### Storage and Background Jobs

```txt
[x] Production guard prevents silent .data usage without Convex.
[x] Convex metadata/storage scaffolding exists.
[x] R2 original file storage is wired through Convex R2; deploy env and real-upload QA still required.
[x] Source preview images are generated as WebP and stored through Convex R2/questionSources when configured.
[x] Background extraction worker route and Convex cron recovery are implemented.
[x] Upload job polling/non-blocking status is implemented.
```

### Developer and Release Gates

```txt
[x] package.json has build/start scripts required for Next deployment.
[x] Next.js 16.2.6 and React 19.2.4 are installed.
[x] README documents required service env vars.
[x] Production safety checklist exists.
[x] README is release/runbook focused.
[x] ESLint release surface ignores generated/worktree/archive folders.
[x] React Compiler/React Hooks lint errors are fixed.
[x] Convex generated files regenerated/verified for CLI scripts: `npx convex codegen`.
```

## Current Not Done List

P0 before paid launch:

```txt
[ ] Verify Clerk Billing plan slugs/prices match Convex `free`, `starter`, `pro`, and `school` quota profiles.
[ ] Verify paid, canceled, and past-due quota behavior in staging.
[~] Verify deployed duplicate uploads create only one paid OpenRouter call. Implementation is hardened at upload job claim; final proof still requires a real paid production session cookie plus OpenRouter usage review.
[ ] Set OpenRouter hard spend caps for dev/staging/production keys.
[ ] Require/verify Convex-backed rate limits in production.
```

P1 before broader beta:

```txt
[x] Add durable R2 storage for original files.
[x] Add durable R2/webp storage for source page preview images.
[x] Move extraction to durable background jobs.
[ ] Complete manual browser QA with real PDFs.
[x] Reconcile Convex plan limits with local Clerk Billing product copy and plan slugs; live Clerk Dashboard verification remains P0.
```

P2 later:

```txt
[x] Add Ask retrieval over persisted source chunks/RAG.
[x] Add DOCX/PPTX server conversion or clear rejection.
[x] Add internal operator dashboard for cost, abuse, and audit-event review.
[x] Add sitemap, robots, OG image, and richer metadata.
[ ] Pass Lighthouse/Core Web Vitals release gate.
```

## Final Staging Smoke Checklist

| Smoke item | Owner | Status | Date | Notes |
|------------|-------|--------|------|-------|
| Deploy latest main/staging build with production-like Clerk and Convex env | Codex | Done | 2026-05-28 | Production deployment `dpl_3vFK1RG5pV8ckjkrvP9eH6ozFcZ3` is live at `https://www.drnote.co`. |
| Visit public pages: `/`, `/features`, `/pricing`, `/exams`, `/support` | Codex | Done | 2026-05-28 | All returned 200 from `https://www.drnote.co`. |
| Verify anonymous exam catalog library add/remove on `/exams` and `/exam/[slug]` | TBD | Not started | TBD | Expected: local browser save works without sign-in. |
| Verify unauthenticated protected routes redirect: `/dashboard`, `/pdf`, `/dashboard/content/study` | Codex | Done | 2026-05-28 | All returned 307 to `/pricing` with `x-clerk-auth-status: signed-out`. |
| Sign in, upload a small searchable PDF, and reach study mode | TBD | Not started | TBD | Confirm job completes and no duplicate upload is created. |
| Open quiz, exam, review, flashcards, summary, and sessions from one file | TBD | Not started | TBD | Use a real PDF with at least 4 answer choices. |
| Open source preview from a question | TBD | Not started | TBD | Confirm no 404 loop or modal hang. |
| Trigger unsupported file and too-large file errors | Codex | Partial | 2026-05-28 | DOCX live API smoke returns 400 with clear copy; too-large file still needs browser/API size-limit QA. |
| Run `npm run report:cost` against staging | Codex | Done | 2026-05-28 | Command runs; report shows historical duplicate-charged files, so paid duplicate proof remains open. |
| Run `npm run test:deployed-duplicate-extraction` | Codex | Blocked | 2026-05-28 | Anonymous live run returns 402 before OpenRouter. Production Clerk rejects backend-created sessions; requires real signed-in paid user cookie/token. |

## Final Paid-Launch Checklist

| Item | Owner | Status | Date | Notes |
|------|-------|--------|------|-------|
| Clerk Billing plans are configured with final names, prices, and plan slugs | TBD | Not started | TBD | Slugs must map to Convex `starter`, `pro`, or `school`. |
| Clerk Billing visible limits match `convex/planLimits.ts` | TBD | Not started | TBD | No public numeric limits should exceed backend enforcement. |
| Paid, canceled, and past-due users receive expected Convex limits/blocks | TBD | Not started | TBD | Verify with real staging users. |
| OpenRouter hard spend caps are set for production keys | TBD | Not started | TBD | External dashboard action. |
| Convex-backed rate limits are verified on deployed shared instances | TBD | Not started | TBD | Confirm no local memory-only limiter in production path. |
| Duplicate-upload smoke proves one paid OpenRouter call across deployed instances | TBD | Blocked | 2026-05-28 | Code now uses atomic queued-job claim; live paid-session proof still requires real Clerk browser session and OpenRouter dashboard review. |
| Support inbox/process is monitored for `/support` requests | TBD | Not started | TBD | Confirm `support@drnote.co` routing and owner. |
| Production Clerk keys, Convex deployment, and required secrets are set | Codex | Partial | 2026-05-28 | Vercel production has Clerk, Convex, quota, R2, OpenRouter, webhook, and extraction storage env vars; `USAGE_LEDGER_SECRET` falls back to `EXTRACTION_STORAGE_SECRET`. `ADMIN_CLERK_USER_IDS` was added for production owner access. |
| Public copy review is complete | TBD | Not started | TBD | Confirm no unfinished paid features are promised. |
| Go/no-go owner signs off | TBD | Not started | TBD | Final launch decision. |

## Command Results

```txt
npx tsc --noEmit
PASS

npm run test:source-qa
PASS: 22 tests

npm run test:pipeline-safety
PASS: 61 tests

npm run test:extraction-failure
PASS: 14 tests

npm run build
PASS

npm run lint
PASS

npm run report:cost
PASS

npm run test:deployed-duplicate-extraction
PARTIAL/BLOCKED: unauthenticated live run returns 402 before OpenRouter; production Clerk rejects backend-created sessions, so paid duplicate proof needs a real browser session cookie.

Live route smoke, https://www.drnote.co
PASS: /, /features, /pricing, /exams, /support, /robots.txt, /sitemap.xml returned 200
PASS: /dashboard, /pdf, /dashboard/content/study returned 307 to /pricing

Live unsupported upload smoke
PASS: DOCX upload returned 400 unsupported_file_type with clear copy

npm run report:bundle
PASS

Lighthouse /
NOT PASS: Performance 70, Accessibility 100, Best Practices 77, SEO 100
```
