# Source highlight QA test matrix

Run automated checks:

```bash
npm run test:source-qa
```

Manual verification in dev (`npm run dev` → study session):

| Case | Expected | Status |
|------|----------|--------|
| One-page PDF, plain text questions | Full page + amber question-block highlight | ☐ manual |
| Multi-page PDF | Opens correct page only; highlight on that page | ☐ manual |
| Question split across lines | Block spans all lines through options | ☐ manual |
| Image/diagram between stem and options | Block width expands; includes image gap | ☐ manual |
| Two-column PDF | Best-effort block; debug overlay shows chunks | ☐ manual |
| Question near bottom of page | Highlight visible; page scrolls into view | ☐ manual |
| Missing `sourceRegion` | Page shown; fallback banner; no fake box | ☐ manual |
| Low-confidence region (`confidence < 0.5`) | Page shown; no highlight box | ☐ manual |
| Huge page count PDF | Only requested page rendered/cached | ☐ manual |
| Image upload with region | Image highlighter + normalized overlay | ☐ manual |
| Cached page hit | Second open uses IndexedDB (`cacheSource: indexeddb`) | ☐ manual |
| Cached page miss | First open renders PDF.js once; saves IndexedDB | ☐ manual |

## Dev tooling

- **Debug regions** toggle in source modal header (development only)
- **Reprocess source regions** button (bottom-left dev toolbar on study page)

## Telemetry

Open browser console and click **Source**. Look for:

```json
[source-view] {"fileId":"...","highlightConfirmed":true,...}
```

PostHog event: `source_view` (when PostHog is loaded).

## Cache priority

1. Server `/api/pdf/page-preview` (404 until implemented)
2. IndexedDB `page-previews`
3. PDF.js single-page render
4. Never all pages
