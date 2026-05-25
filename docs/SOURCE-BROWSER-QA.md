# Source Browser QA

No UI redesign. This document verifies the current question source payload path in a real browser.

## Test Files

Use searchable PDFs only for this pass:

```txt
[ ] One-page PDF
[ ] Multi-page PDF
[ ] PDF with cached extraction result
[ ] PDF after source-region reprocess
[ ] Record with missing source preview
[ ] Record with invalid source region
```

## Manual Browser Checklist

| Case | Expected result | Actual result | Pass/fail |
|---|---|---|---|
| One-page PDF Source click | Opens source page image, no infinite loading | Pending browser run | Pending |
| Multi-page PDF Source click | Opens the correct page number | Pending browser run | Pending |
| Cached source payload | Opens from cached payload without `/api/pdf/page-preview` loop | Pending browser run | Pending |
| After reprocess | Source opens and uses regenerated preview metadata | Pending browser run | Pending |
| Missing preview | Shows clean not-ready/unavailable state | Pending browser run | Pending |
| Invalid region | Shows page without fake highlight | Pending browser run | Pending |
| Source image load failure | Ends in error state and persists audit event | Pending browser run | Pending |

## Must Verify

```txt
[ ] No Loading forever.
[ ] No repeated /api/pdf/page-preview 404 loop.
[ ] No Chrome crash.
[ ] Correct source page opens.
[ ] Highlight surrounds the correct question block.
[ ] Debug regions match the real page coordinate system.
[ ] Missing source payload gives a clean not-ready/error state.
```

## Persisted Events

The following source failures should appear in Convex `appAuditEvents`:

```txt
source_not_ready
source_payload_missing
source_region_invalid
source_image_load_failed
```

Each event should include:

```ts
{
  userId,
  eventType,
  feature: "source",
  fileHash?,
  questionId?,
  reason?,
  createdAt
}
```
