import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_HIGHLIGHT_CONFIDENCE,
  isHighlightConfidenceSufficient,
  normalizeSourceRegion,
} from "../highlightable-source.ts";
import { mapQuestionsToSourceChunks, findBestChunkForQuestion } from "../map-questions-to-chunks.ts";
import type { SourceChunk } from "../highlightable-source.ts";
import {
  createCssViewport,
  isValidHighlightRegion,
} from "../pdf-source-region.ts";
import { filterChunksForPage, previewChunkText } from "../source-debug.ts";
import { validateSourceRegionForImage } from "../source-preview-store.server.ts";

describe("normalizeSourceRegion", () => {
  it("maps legacy pdf-text method to pdf-layout", () => {
    const region = normalizeSourceRegion(
      {
        x: 0.1,
        y: 0.2,
        width: 0.5,
        height: 0.2,
        method: "pdf-text" as never,
      },
      3,
    );

    assert.equal(region?.method, "pdf-layout");
    assert.equal(region?.pageNumber, 3);
    assert.equal(region?.sourceKind, "question-block");
  });
});

describe("highlight confidence", () => {
  it("rejects low-confidence stored regions", () => {
    assert.equal(isHighlightConfidenceSufficient(undefined), true);
    assert.equal(isHighlightConfidenceSufficient(0.9), true);
    assert.equal(isHighlightConfidenceSufficient(MIN_HIGHLIGHT_CONFIDENCE), true);
    assert.equal(isHighlightConfidenceSufficient(0.2), false);
  });
});

describe("css viewport validation", () => {
  it("validates regions against css viewport not 2x render viewport", () => {
    const renderViewport = { width: 1200, height: 1600, scale: 2, transform: [1, 0, 0, 1, 0, 0] };
    const cssViewport = createCssViewport(renderViewport, 2);

    const cssRegion = { x: 60, y: 80, width: 500, height: 200 };
    assert.equal(isValidHighlightRegion(cssRegion, cssViewport), true);

    const tooWide = { x: 0, y: 0, width: cssViewport.width * 0.98, height: 100 };
    assert.equal(isValidHighlightRegion(tooWide, cssViewport), false);
  });
});

describe("server source preview coordinate validation", () => {
  it("accepts normalized regions that fit the generated image", () => {
    assert.equal(
      validateSourceRegionForImage(
        {
          pageNumber: 1,
          x: 0.1,
          y: 0.2,
          width: 0.4,
          height: 0.1,
          sourceKind: "question-block",
          method: "pdf-layout",
          confidence: 0.9,
        },
        1000,
        1414,
      ),
      true,
    );
  });

  it("rejects out-of-bounds or low-confidence regions", () => {
    assert.equal(
      validateSourceRegionForImage(
        {
          pageNumber: 1,
          x: 0.8,
          y: 0.2,
          width: 0.4,
          height: 0.1,
          sourceKind: "question-block",
          method: "pdf-layout",
          confidence: 0.9,
        },
        1000,
        1414,
      ),
      false,
    );
    assert.equal(
      validateSourceRegionForImage(
        {
          pageNumber: 1,
          x: 0.1,
          y: 0.2,
          width: 0.4,
          height: 0.1,
          sourceKind: "question-block",
          method: "pdf-layout",
          confidence: 0.2,
        },
        1000,
        1414,
      ),
      false,
    );
  });
});

describe("mapQuestionsToSourceChunks", () => {
  const chunks: SourceChunk[] = [
    {
      id: "chunk_1",
      pageNumber: 1,
      text: "1. Male with breast cancer on chemo which vaccine to give?",
      region: {
        pageNumber: 1,
        x: 0.05,
        y: 0.1,
        width: 0.9,
        height: 0.15,
        sourceKind: "question-block",
        method: "pdf-layout",
        confidence: 0.9,
      },
    },
    {
      id: "chunk_2",
      pageNumber: 1,
      text: "2. Child with fever and rash — next step?",
      region: {
        pageNumber: 1,
        x: 0.05,
        y: 0.3,
        width: 0.9,
        height: 0.12,
        sourceKind: "question-block",
        method: "pdf-layout",
        confidence: 0.9,
      },
    },
  ];

  it("maps by question number", () => {
    const mapped = mapQuestionsToSourceChunks(
      [{ questionNumber: 2, questionText: "Child with fever and rash" }],
      chunks,
    );

    assert.equal(mapped[0]?.sourceChunkIds?.[0], "chunk_2");
    assert.equal(mapped[0]?.sourcePage, 1);
  });

  it("finds best chunk by text overlap", () => {
    const chunk = findBestChunkForQuestion(
      { questionText: "Male with breast cancer on chemo" },
      chunks,
      0,
    );
    assert.equal(chunk?.id, "chunk_1");
  });
});

describe("source debug helpers", () => {
  it("filters chunks by page", () => {
    const chunks: SourceChunk[] = [
      {
        id: "a",
        pageNumber: 1,
        text: "1. One",
        region: {
          pageNumber: 1,
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.1,
          sourceKind: "question-block",
          method: "pdf-layout",
        },
      },
      {
        id: "b",
        pageNumber: 2,
        text: "2. Two",
        region: {
          pageNumber: 2,
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.1,
          sourceKind: "question-block",
          method: "pdf-layout",
        },
      },
    ];

    assert.equal(filterChunksForPage(chunks, 1).length, 1);
    assert.equal(
      previewChunkText("abcdefghijklmnopqrstuvwxyz1234567890").length,
      36,
    );
  });
});

describe("source QA test matrix expectations", () => {
  const matrix = [
    "one-page PDF with plain text questions",
    "multi-page PDF",
    "PDF with question split across lines",
    "PDF with image/diagram between stem and options",
    "two-column PDF",
    "question near bottom of page",
    "missing sourceRegion",
    "low-confidence region",
    "huge page count PDF (single page render only)",
    "image upload with region",
    "cached page image hit/miss",
  ];

  it("documents manual QA cases", () => {
    assert.equal(matrix.length, 11);
  });
});
