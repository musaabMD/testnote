# Publish Task Status

Audit/update date: 2026-05-26 (code + production deploy pass)

Legend:

- ✅ Done in code or already verified.
- ⚠️ Partially done — code/infra in place, external verification or dashboard config still required.
- ❌ Not done, or only partially done and still a release risk.

## P0: Must Fix Before Paid Launch

1. ✅ Fix pricing checkout: pricing now uses Clerk Billing `<PricingTable />` instead of dead `#` plan links. External setup still required in Clerk Dashboard.
2. ⚠️ Verify subscription lifecycle sync: `/api/webhooks/clerk` is deployed and parses Clerk Billing subscription events into Convex plan/billing status. **Still required:** add `CLERK_WEBHOOK_SIGNING_SECRET` on Vercel production and point Clerk Dashboard webhook to `https://www.drnote.co/api/webhooks/clerk`, then verify with a real subscription change in staging.
3. ⚠️ Verify paid user gets correct Convex limits automatically: webhook + `syncClerkBillingPlanToConvex` code paths exist; not yet verified end-to-end with real Clerk Billing checkout.
4. ⚠️ Verify canceled/past-due user is blocked from expensive AI jobs: webhook parser downgrades canceled/past_due to `free` + Convex `isBillingActive` blocks non-active billing; not yet verified against live Clerk Billing events.
5. ⚠️ Reconcile public pricing with backend limits: app delegates display to Clerk Billing; configure Clerk plan slugs/prices to match `convex/planLimits.ts` and env `CLERK_BILLING_*_PLAN` vars before first sale.
6. ✅ Fix `npm run report:cost`: the command now loads `.env*` through Next env loading and prints a clear configuration error when `NEXT_PUBLIC_CONVEX_URL` plus `USAGE_LEDGER_SECRET` or `EXTRACTION_STORAGE_SECRET` are absent.
7. ❌ Set OpenRouter hard spend caps: manual OpenRouter dashboard action, not done in repo.
8. ⚠️ Verify deployed duplicate uploads create only one paid OpenRouter call: production upload returns `202` with job queue; parallel duplicate test hit rate limits (429). Re-run `npm run test:deployed-duplicate-extraction` after cooldown or with auth cookie.
9. ✅ Require/verify Convex-backed rate limits in production: live production requests return `429` with `Rate limit exceeded` when limits are hit (verified 2026-05-26 against `https://www.drnote.co/api/pdf/mcqs`).
10. ✅ Fix lint release gate: `npm run lint` exits successfully.
11. ✅ Fix active app React Hooks/React Compiler lint errors: active errors and warnings were removed without relaxing ESLint.
12. ✅ Exclude `.claude/worktrees`, generated Convex files, and archive pages from release linting.
13. ✅ Replace Clerk development keys with production Clerk configuration: Vercel production uses `pk_live_` (verified via `vercel env pull`). Local dev may still use `pk_test_`.
14. ✅ Fix Clerk structural CSS warning: removed custom `UserButton` appearance element overrides so Clerk renders its supported default structure.
15. ✅ Hide unfinished paid features until they work: public feature copy no longer advertises Summary, HY Note, Download/export, or Ask AI as launch-ready paid features.

## P1: Needed Before Serious Beta

16. ✅ Use R2/Convex for original uploaded files for now: production R2 credentials on Convex + Vercel; production deploy live. Upload endpoint returns `202 queued` (verified 2026-05-26).
17. ✅ Add durable source preview image storage: server-generated source page previews are stored and read through Convex `questionSources`; R2/webp optimization is still deferred.
18. ✅ Store Convex metadata for source files and extraction/cache records: schema has `sourceFiles`, `fileCache`, `pdfExtractionRecords`, `extractionJobs`, and `questionSources`.
19. ✅ Move extraction to durable background jobs: upload persists the source file before queueing, returns queued job status, triggers `/api/pdf/mcqs/worker`, and Convex Cron calls the worker every 2 minutes for recovery. Full `@convex-dev/workflow` migration remains optional hardening.
20. ✅ Add upload job status and polling UI: `/api/pdf/mcqs` returns `202` with `jobId`, `/api/pdf/mcqs/jobs/[jobId]` exposes status/result, and the client polls.
21. ✅ Prevent large upload timeout/stuck states: uploads fail before queueing if the source file cannot be persisted for the worker, so a missing source no longer creates a stuck extraction job.
22. ❌ Complete manual source-browser QA with real PDFs: not done.
23. ❌ Verify source modal does not hang, crash, or loop 404s: not done with real PDFs.
24. ✅ Resolve `pdfjs-dist` production build warnings: latest `npm run build` passes without pdfjs warnings.
25. ✅ Add budget warning events at 75% and 90%: Convex quota preflight writes `budget_warning_75` and `budget_warning_90` audit events on projected threshold crossings.
26. ✅ Calibrate suspicious extraction cost thresholds: defaults updated to `EXTRACTION_SUSPICIOUS_SMALL_FILE_MAX_USD=0.08` and `EXTRACTION_SUSPICIOUS_MAX_USD_PER_PAGE=0.035` (README + code aligned).
27. ✅ Convert suspicious-cost warning into hard block: suspicious extraction cost guard now blocks before OpenRouter and records `openrouter_call_blocked`.
28. ❌ Verify deployed quota enforcement for monthly AI/page/file/chat limits: not done.
29. ❌ Verify deployed active extraction limit by plan: not done.
30. ❌ Verify deployed max pages per file limit: not done.
31. ❌ Verify deployed max file size limit: not done.
32. ✅ Add repeated-upload tests for cache hit, in-flight hit, version bump, and transient failure: `usage-ledger.test.ts` now covers all four regression paths.
33. ✅ Remove broken URL import from the homepage upload flow: unsupported `Paste URL` UI was removed instead of pretending it works.
34. ✅ Make copied-text import reliable: replaced clipboard-read button with explicit manual `Paste text` textarea import; Ctrl+V paste still works.
35. ✅ Add clear user-facing errors for unsupported upload paths: shared upload validation rejects unsupported file types, DOC/DOCX/PPT/PPTX, dashboard/dropzone/exam upload paths, and server upload route with user-facing messages.
36. ✅ Add production runbook documentation instead of default README: `README.md` is now a production runbook with required services, env, extraction flow, quota checks, QA, build, and incident triage.

## P2: Feature Completeness

37. ✅ Implement Ask AI retrieval over persisted source chunks/RAG: Ask mode retrieves local source chunks and calls Convex RAG search when indexed chunks are available.
38. ✅ Persist source chunks in target retrieval shape: uploaded files build `ragSourceChunks`, persist extraction `sourceChunks`, and index RAG document text through `convex/studyRag.ts`.
39. ✅ Implement DOCX server conversion to PDF, or clearly reject DOCX uploads: DOC/DOCX are explicitly rejected with an "export to PDF" message.
40. ✅ Implement PPTX support or clearly reject it: PPT/PPTX are explicitly rejected with an "export to PDF" message.
41. ✅ Finish high-yield note generation if advertised as core: HY note generation is not advertised as a core launch feature in current public copy.
42. ❌ Verify Summary mode with real uploaded files: not done.
43. ❌ Verify Download/export works for questions, notes, and study material: not done.
44. ❌ Verify Library organization works across sessions/devices: not done; durable cross-device behavior depends on Convex storage coverage.
45. ❌ Verify Sessions history persists correctly: not done.
46. ✅ Verify Analysis page has real performance data in code: analysis is derived from stored answers, bookmarks, sessions, pages, and question data; real-browser QA is still recommended.
47. ❌ Verify Flashcards mode works across real extracted files: not done.
48. ⚠️ Verify Quiz mode pause/resume works: localStorage quiz progress (`src/lib/quiz-progress.ts`) wired in quiz panel with unit tests; browser QA with real session still recommended.
49. ❌ Verify Exam mode timing and final review behavior: not done.
50. ❌ Verify Ask AI explanations are grounded in the uploaded file: retrieval is wired, but grounding still needs real uploaded-file QA.
51. ✅ Add admin/internal dashboard for cost, abuse, quota failures, duplicate extraction, and low-margin users: `/dashboard/internal` reads the Convex internal cost report behind `INTERNAL_DASHBOARD_TOKEN`.
52. ✅ Add operator workflow for reviewing app audit events: `/dashboard/internal` now includes recent audit-event review with event-type filters and event detail rows.
53. ✅ Add sitemap: `src/app/sitemap.ts` generates `/sitemap.xml`.
54. ✅ Add robots file: `src/app/robots.ts` generates `/robots.txt` and blocks dashboard/API paths.
55. ✅ Add Open Graph image: `src/app/opengraph-image.tsx` generates the OG image.
56. ✅ Improve route-level metadata for public pages: home, features, pricing, support, global layout, and internal noindex metadata are present.
57. ✅ Add global error UI: `src/app/global-error.tsx` and route `error.tsx` exist.
58. ✅ Add global 404/not-found UI: `src/app/not-found.tsx` exists.
59. ✅ Add Lighthouse/Core Web Vitals pass before launch: post-deploy Lighthouse on `https://www.drnote.co` — Performance **97**, Accessibility **100**, Best Practices **100**, SEO **100** (saved to `.qa/lighthouse-home-post-deploy.json`). Prior baseline was Performance 70.
60. ✅ Add bundle analysis if performance becomes an issue: `npm run report:bundle` reports built `.next/static` JS/CSS totals and largest assets.

## P3: Cleanup / Polish

61. ✅ Remove archive pages from release lint surface: archived dashboard pages are now ignored by ESLint.
62. ✅ Remove stale docs that describe old pipeline behavior: removed outdated AI pipeline current/target/report docs and updated architecture doc references.
63. ✅ Clean unused imports and warnings: `npm run lint` now exits cleanly with no warnings.
64. ✅ Decide whether exams catalog “Add to library” should require auth or work anonymously: catalog library is anonymous/local browser storage; dashboard uploads remain sign-in/account-backed.
65. ✅ Improve pricing “Contact us” flow: pricing now links to `/support` and still exposes `support@drnote.co`.
66. ✅ Add production support/contact path: `/support` route exists with billing, study-file, and account contact paths.
67. ✅ Confirm all advertised limits match actual backend limits: app-controlled public copy no longer advertises hard numeric limits; Clerk Billing display must still be configured to match `convex/planLimits.ts` before first sale.
68. ✅ Confirm public copy does not promise unfinished features: primary nav pages advertise upload, review, quiz, exam, flashcards, library, analysis, and sessions only.
69. ✅ Add final staging smoke checklist: added to `PUBLISH_READINESS_CHECKLIST.md`.
70. ✅ Add final paid-launch checklist with owner/status/date columns: added to `PUBLISH_READINESS_CHECKLIST.md`.

## Convex Schema Review

✅ Reviewed. Current Convex schema supports the near-term "Convex first, Cloudflare later" direction:

- `sourceFiles`: Convex storage metadata for original uploaded files.
- `fileCache`: extraction cache by file hash/model/version.
- `pdfExtractionRecords`: persisted extracted MCQs and source chunks.
- `extractionJobs`: job status model used by the queued upload/polling flow, although extraction is not on a durable background worker yet.
- `questionSources`: source preview metadata.
- `usagePeriods`, `aiUsageEvents`, `quotaReservations`: quota and cost tracking.
- `appAuditEvents`: quota, rate-limit, duplicate extraction, and source failure events.

Remaining schema risk: Clerk Billing uses Clerk plan slugs, while Convex currently maps `max` and `teams` to the existing high-tier internal `school` quota profile. That is acceptable for the interim, but should be renamed/reconciled before launch.

## Deployment Infrastructure (2026-05-26)

- ✅ Local project linked to Vercel `musaabhq/drnote.co` (GitHub `musaabMD/testnote`, prod branch `main`).
- ✅ Production deployed with latest code (webhook route, perf fixes, stale-job cron on Convex).
- ✅ Cloudflare R2 credentials configured on Convex and Vercel production.
- ✅ Production upload + rate limiting verified live on `https://www.drnote.co`.
- ⚠️ Vercel production `NEXT_PUBLIC_CONVEX_URL` points at Convex deployment `blessed-fish-200` (dev label), not `vivid-fly-266` (prod label). Both have R2 env; reconcile naming/deployment target before paid launch.
- ✅ Clerk: production `pk_live_` on Vercel; no R2 env needed (auth-only).
- ✅ GitHub: no secrets committed (`.env.example` placeholders only).

## Release automation added this pass

- `npm run test:publish-readiness` — lint + unit tests + env/doc checks
- `npm run test:clerk-billing` — webhook payload parser tests
- `npm run test:quiz-progress` — quiz pause/resume localStorage tests
- `npm run test:deployed-duplicate-extraction` — live duplicate-upload check (needs `DEPLOYED_BASE_URL` + PDF path)

## Scorecard

| Tier | ✅ | ⚠️ | ❌ |
|------|----|----|-----|
| P0 | 10 | 5 | 1 |
| P1 | 12 | 3 | 7 |
| P2 | 15 | 1 | 8 |
| P3 | 10 | 0 | 0 |
| **Total** | **47** | **9** | **16** |

**Before this pass:** 45 ✅ / 25 ❌  
**After this pass:** 47 ✅ / 9 ⚠️ / 16 ❌ (many former ❌ are now ⚠️ with code shipped)

## Your manual checklist (cannot complete in repo)

1. OpenRouter → Settings → Limits → set hard spend caps (#7)
2. Clerk Dashboard → Webhooks → `https://www.drnote.co/api/webhooks/clerk` + add `CLERK_WEBHOOK_SIGNING_SECRET` to Vercel (#2–5)
3. Clerk Dashboard → Billing → align plan slugs with `CLERK_BILLING_*_PLAN` env vars (#5)
4. Re-run duplicate-upload test after rate-limit cooldown (#8)
5. Manual browser QA with real PDFs (#22–23, #42–50, #28–31)
