# User Upload Limits

Last updated: 2026-05-28

This document lists the current user-facing upload rules for DrNote/TestNote. Public plan names, plan limits, prices, and upgrade copy must come from Clerk Billing only.

## Accepted Uploads

Users can upload:

| File category | Supported formats |
| --- | --- |
| PDF | `.pdf` |
| Images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.heic` |
| Text documents | `.txt`, `.md`, `.rtf` |

The upload picker accepts PDF, image, plain text, markdown, and RTF files.

For any file that the uploader does not accept, guide the user to export or save the material as PDF, image, text, markdown, or RTF and upload that version.

## Plan Limits

Use Clerk Billing as the only source of truth for user-facing plan limits.

Do not publish a separate hardcoded plan table in this repo unless it is generated from, or manually verified against, the live Clerk Billing plan configuration on the same day.

Clerk plan copy should define these user-facing limits for each paid plan:

- Files per month
- Pages per month
- Max pages per file
- Max file size
- Active extraction jobs
- Chat messages per day

Notes:

- Public pages should display Clerk plan names only, for example the plan names returned by Clerk Billing.
- Do not expose backend/internal plan names in user-facing copy.
- Monthly counters reset at the start of each UTC calendar month.
- Image, text, markdown, and RTF uploads count as 1 page for quota checks.
- PDF uploads use the detected PDF page count when available. If page detection fails, the upload is treated as 1 page for preflight checks.
- Uploads can also be blocked by monthly AI budget, account billing status, API rate limits, or temporary service availability.

## Server Hard Cap

The upload route also has a server-level hard cap. The default is 500 MB, controlled by `MAX_SERVER_UPLOAD_BYTES`.

Plan limits should stay at or below the server hard cap. If `MAX_SERVER_UPLOAD_BYTES` is lowered, update this document and the user-facing plan copy before release.

## User-Facing Error Copy

Use clear, action-oriented language:

| Situation | Suggested message |
| --- | --- |
| File type cannot be uploaded | Upload a PDF, image, text, markdown, or RTF file. |
| Editable document or deck | Export the file to PDF, then upload the PDF. |
| File exceeds plan limit | File is too large for your current plan. Upgrade or upload a smaller file. |
| Monthly upload/page limit reached | Monthly upload limit reached. Upgrade or wait until your monthly limit resets. |
| Too many active jobs | Another file is still processing. Wait for it to finish, then try again. |
| Rate limit reached | Too many requests. Wait a moment, then try again. |

## Source Of Truth

- User-facing plan names, prices, and limits: Clerk Billing
- Accepted upload types in the app: `src/lib/upload-file-types.ts`
- Server upload hard cap: `src/app/api/pdf/mcqs/route.ts`
- Clerk plan display in the app: `src/components/pricing-plans.tsx`
- Clerk plan sync: `src/lib/clerk-billing.server.ts`
