# Publish Task Status

Audit/update date: 2026-05-26

Legend:

- ✅ Done in code or already verified.
- ❌ Not done, or only partially done and still a release risk.

## P0: Must Fix Before Paid Launch

1. ✅ Fix pricing checkout: pricing now uses Clerk Billing `<PricingTable />` instead of dead `#` plan links. External setup still required in Clerk Dashboard.
2. ❌ Verify subscription lifecycle sync: old Stripe webhook verification is superseded by Clerk Billing; Clerk plan lifecycle/webhook behavior still needs staging verification.
3. ❌ Verify paid user gets correct Convex limits automatically: code now syncs Clerk `has({ plan })` into Convex quotas, but it has not been verified with real Clerk Billing plans.
4. ❌ Verify canceled/past-due user is blocked from expensive AI jobs: not verified against Clerk Billing cancellation/failure states.
5. ❌ Reconcile public pricing with backend limits: app now delegates display to Clerk Billing, but Clerk plan slugs/prices must be configured to match Convex quota profiles.
6. ✅ Fix `npm run report:cost`: the command now loads `.env*` through Next env loading and prints a clear configuration error when `NEXT_PUBLIC_CONVEX_URL` plus `USAGE_LEDGER_SECRET` or `EXTRACTION_STORAGE_SECRET` are absent.
7. ❌ Set OpenRouter hard spend caps: manual OpenRouter dashboard action, not done in repo.
8. ❌ Verify deployed duplicate uploads create only one paid OpenRouter call: staging URL, test PDF, and auth are still required.
9. ❌ Require/verify Convex-backed rate limits in production: bridge exists, but deployed shared-instance verification is still required.
10. ✅ Fix lint release gate: `npm run lint` exits successfully.
11. ✅ Fix active app React Hooks/React Compiler lint errors: active errors and warnings were removed without relaxing ESLint.
12. ✅ Exclude `.claude/worktrees`, generated Convex files, and archive pages from release linting.
13. ❌ Replace Clerk development keys with production Clerk configuration: external environment setup, not done in repo.
14. ✅ Fix Clerk structural CSS warning: removed custom `UserButton` appearance element overrides so Clerk renders its supported default structure.
15. ✅ Hide unfinished paid features until they work: public feature copy no longer advertises Summary, HY Note, Download/export, or Ask AI as launch-ready paid features.

## P1: Needed Before Serious Beta

16. ✅ Use R2/Convex for original uploaded files for now: `sourceFiles` tracks R2 keys and still resolves legacy Convex `_storage` rows; signed-in client uploads use Convex R2 signed URLs and server-side upload persistence stores through the Convex R2 component up to the current server store cap.
17. ✅ Add durable source preview image storage: server-generated source page previews are stored and read through Convex `questionSources`; R2/webp optimization is still deferred.
18. ✅ Store Convex metadata for source files and extraction/cache records: schema has `sourceFiles`, `fileCache`, `pdfExtractionRecords`, `extractionJobs`, and `questionSources`.
19. ❌ Move extraction to durable background jobs: upload now returns a queued job and runs extraction with Next `after()`, but a real durable worker/workflow is still not implemented.
20. ✅ Add upload job status and polling UI: `/api/pdf/mcqs` returns `202` with `jobId`, `/api/pdf/mcqs/jobs/[jobId]` exposes status/result, and the client polls.
21. ❌ Prevent large upload timeout/stuck states: improved by queued response/polling, but still not fully solved without a durable background worker and retry model.
22. ❌ Complete manual source-browser QA with real PDFs: not done.
23. ❌ Verify source modal does not hang, crash, or loop 404s: not done with real PDFs.
24. ✅ Resolve `pdfjs-dist` production build warnings: latest `npm run build` passes without pdfjs warnings.
25. ✅ Add budget warning events at 75% and 90%: Convex quota preflight writes `budget_warning_75` and `budget_warning_90` audit events on projected threshold crossings.
26. ❌ Calibrate suspicious extraction cost thresholds: not done.
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
48. ❌ Verify Quiz mode pause/resume works: not done.
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
59. ❌ Add Lighthouse/Core Web Vitals pass before launch: baseline Lighthouse was run against `/` and saved to `.qa/lighthouse-home.json`, but it is not a pass yet (Performance 70, Accessibility 100, Best Practices 77, SEO 100).
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
