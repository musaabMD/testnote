import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  buildFailureResponse,
  classifyZeroChunkPdfFailure,
  isTransientFailureReason,
  isUpstreamFailureReason,
} from "../extraction-failure.server.ts";
import { validateMcqExtractionResponse } from "../mcq-result-validation.server.ts";
import {
  hasSelectableText,
  probePdfSelectableText,
  type PdfTextProbeResult,
} from "../pdf-text-probe.server.ts";

function emptyProbe(overrides?: Partial<PdfTextProbeResult>): PdfTextProbeResult {
  return {
    pageCount: 1,
    sampledPages: [1],
    sampledTextItemCount: 0,
    sampledTextCharCount: 0,
    pdfOpened: true,
    ...overrides,
  };
}

async function createSearchableMcqPdf(): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Sample MCQ Bank",
    "1. What is the capital of France?",
    "A) London",
    "B) Paris",
    "C) Berlin",
    "D) Madrid",
    "2. Which planet is closest to the Sun?",
    "A) Venus",
    "B) Mercury",
    "C) Earth",
    "D) Mars",
  ];
  lines.forEach((line, index) => {
    page.drawText(line, { x: 72, y: 720 - index * 24, size: 12, font });
  });
  return pdf.save().then((bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

async function createBlankPdf(): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save().then((bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

describe("extraction failure classification", () => {
  it("does not map transient chunk failures to no_selectable_text", () => {
    const response = buildFailureResponse("chunk_extraction_failed");
    assert.doesNotMatch(response.error, /no selectable text/i);
    assert.equal(response.failureReason, "chunk_extraction_failed");
    assert.equal(isTransientFailureReason("chunk_extraction_failed"), true);
  });

  it("returns selectable_text_found_but_no_questions when probe found text but no chunks", () => {
    assert.equal(
      classifyZeroChunkPdfFailure({ probeHasText: true, retryProbeHasText: false }),
      "selectable_text_found_but_no_questions",
    );
    assert.equal(
      classifyZeroChunkPdfFailure({ probeHasText: false, retryProbeHasText: true }),
      "selectable_text_found_but_no_questions",
    );
  });

  it("returns no_selectable_text only after probe and retry probe find no text", () => {
    assert.equal(
      classifyZeroChunkPdfFailure({ probeHasText: false, retryProbeHasText: false }),
      "no_selectable_text",
    );
    const response = buildFailureResponse("no_selectable_text");
    assert.match(response.error, /selectable text/i);
  });

  it("maps model JSON failures separately from PDF text failures", () => {
    const jsonFailure = buildFailureResponse("model_invalid_json");
    const schemaFailure = buildFailureResponse("model_invalid_schema");
    assert.doesNotMatch(jsonFailure.error, /selectable text/i);
    assert.doesNotMatch(schemaFailure.error, /selectable text/i);
    assert.match(jsonFailure.error, /invalid format/i);
    assert.equal(isUpstreamFailureReason("model_invalid_json"), true);
    assert.equal(isUpstreamFailureReason("no_selectable_text"), false);
  });
});

describe("hasSelectableText probe thresholds", () => {
  it("requires minimum text items or characters", () => {
    assert.equal(hasSelectableText(emptyProbe()), false);
    assert.equal(
      hasSelectableText(emptyProbe({ sampledTextItemCount: 9, sampledTextCharCount: 99 })),
      false,
    );
    assert.equal(
      hasSelectableText(emptyProbe({ sampledTextItemCount: 10, sampledTextCharCount: 20 })),
      true,
    );
    assert.equal(
      hasSelectableText(emptyProbe({ sampledTextItemCount: 2, sampledTextCharCount: 100 })),
      true,
    );
  });

  it("treats unopened PDFs as having no selectable text", () => {
    assert.equal(hasSelectableText(emptyProbe({ pdfOpened: false })), false);
  });
});

describe("validateMcqExtractionResponse", () => {
  it("returns model_invalid_schema for unrecognizable payloads", () => {
    const result = validateMcqExtractionResponse({ foo: "bar" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "model_invalid_schema");
    }
  });

  it("returns model_empty_mcqs for valid shape with zero questions", () => {
    const result = validateMcqExtractionResponse({
      title: "Test",
      summary: "Summary",
      mcqs: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "model_empty_mcqs");
    }
  });

  it("accepts valid MCQ payloads", () => {
    const result = validateMcqExtractionResponse({
      title: "Test",
      summary: "Summary",
      mcqs: [
        {
          questionNumber: 1,
          questionText: "Sample?",
          options: [
            { label: "A", text: "One" },
            { label: "B", text: "Two" },
            { label: "C", text: "Three" },
            { label: "D", text: "Four" },
          ],
          correctAnswer: "A",
        },
      ],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.result.mcqs.length, 1);
    }
  });
});

describe("pdf text probe integration", () => {
  it("detects selectable text in searchable PDFs", async () => {
    const bytes = await createSearchableMcqPdf();
    const probe = await probePdfSelectableText(bytes);
    assert.equal(probe.pdfOpened, true);
    assert.ok(probe.sampledTextItemCount >= 10 || probe.sampledTextCharCount >= 100);
    assert.equal(hasSelectableText(probe), true);
  });

  it("returns no_selectable_text signal for blank PDFs after probe", async () => {
    const bytes = await createBlankPdf();
    const probe = await probePdfSelectableText(bytes);
    assert.equal(probe.pdfOpened, true);
    assert.equal(hasSelectableText(probe), false);
  });
});

describe("extraction pipeline wiring", () => {
  it("uses pdf text probe before classifying no_selectable_text", () => {
    const extraction = readFileSync(
      path.join(import.meta.dirname, "../pdf-extraction.server.ts"),
      "utf8",
    );
    assert.match(extraction, /probePdfSelectableText/);
    assert.match(extraction, /extractPdfChunksWithRetry/);
    assert.match(extraction, /runFullFileExtraction/);
    assert.match(extraction, /validateMcqExtractionResponse/);
    assert.match(extraction, /extractBatchWithSplitRetry/);
    assert.doesNotMatch(
      extraction,
      /Could not read selectable text from this PDF/,
    );
  });

  it("surfaces upstream failures through async extraction jobs", () => {
    const extraction = readFileSync(
      path.join(import.meta.dirname, "../pdf-extraction.server.ts"),
      "utf8",
    );
    const client = readFileSync(
      path.join(import.meta.dirname, "../process-pdf-upload.ts"),
      "utf8",
    );
    assert.match(extraction, /failureReason: args\.reason/);
    assert.match(client, /payload\.status === "failed"/);
    assert.doesNotMatch(client, /invalid_json/);
  });
});

describe("transient failures are not cached", () => {
  it("only persists cache on successful finalizeExtraction", () => {
    const extraction = readFileSync(
      path.join(import.meta.dirname, "../pdf-extraction.server.ts"),
      "utf8",
    );
    const finalizeStart = extraction.indexOf("async function finalizeExtraction");
    const afterFinalize = extraction.slice(finalizeStart);
    const beforeFinalize = extraction.slice(0, finalizeStart);
    assert.match(afterFinalize, /await persistExtractionCache/);
    assert.doesNotMatch(beforeFinalize, /await persistExtractionCache/);
  });
});
