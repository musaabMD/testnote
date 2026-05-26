import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  countQuestionCandidateSignals,
  hasMcqOptionSequence,
  hasQuestionIntent,
  isAnswerKeyLine,
  isMcqBlockBoundaryLine,
  isNotesOrExplanationLine,
  isOptionLine,
  parseLeadingQuestionNumber,
  parseStandaloneQuestionNumberLine,
  trimMcqBlockEndIndex,
} from "../mcq-line-patterns.ts";
import { extractSourceChunksFromPdfInProcess } from "../pdf-source-chunks.server.ts";

describe("parseLeadingQuestionNumber", () => {
  it("recognizes common numbered MCQ stem formats", () => {
    assert.equal(parseLeadingQuestionNumber("1. What is the capital?"), 1);
    assert.equal(parseLeadingQuestionNumber("12) Choose the best answer"), 12);
    assert.equal(parseLeadingQuestionNumber("3: Select one"), 3);
    assert.equal(parseLeadingQuestionNumber("Q1. Which vaccine?"), 1);
    assert.equal(parseLeadingQuestionNumber("Question 42: Best test?"), 42);
    assert.equal(parseLeadingQuestionNumber("(7) A patient presents"), 7);
    assert.equal(parseLeadingQuestionNumber("No. 5 A child with fever"), 5);
    assert.equal(parseLeadingQuestionNumber("8 What is the diagnosis"), 8);
  });

  it("ignores non-question lines", () => {
    assert.equal(parseLeadingQuestionNumber("A) Option one"), null);
    assert.equal(parseLeadingQuestionNumber("Page 12"), null);
    assert.equal(parseLeadingQuestionNumber(""), null);
  });
});

describe("parseStandaloneQuestionNumberLine", () => {
  it("detects lines that are only a question number", () => {
    assert.equal(parseStandaloneQuestionNumberLine("14"), 14);
    assert.equal(parseStandaloneQuestionNumberLine("1. Question"), null);
  });
});

describe("isOptionLine", () => {
  it("detects common option labels", () => {
    assert.equal(isOptionLine("A) First option"), true);
    assert.equal(isOptionLine("B. Second option"), true);
    assert.equal(isOptionLine("(C) Third option"), true);
    assert.equal(isOptionLine("d) Fourth option"), true);
    assert.equal(isOptionLine("1. Question stem"), false);
  });
});

describe("hasMcqOptionSequence", () => {
  it("requires A, B, and at least C or D", () => {
    const lines = [
      { text: "Stem?" },
      { text: "A) One" },
      { text: "B) Two" },
      { text: "C) Three" },
      { text: "D) Four" },
    ];
    assert.equal(hasMcqOptionSequence(lines, 1), true);
    assert.equal(hasMcqOptionSequence([{ text: "A) Only one" }], 0), false);
  });
});

describe("question candidate signals", () => {
  it("counts numbered and option-backed question blocks", () => {
    assert.equal(
      countQuestionCandidateSignals(`1. Which diagnosis is most likely?
A) Asthma
B) COPD
C) Pneumonia

2. What is the next step?
A) Observe
B) CT
C) Antibiotics`),
      2,
    );
  });

  it("detects Arabic question intent", () => {
    assert.equal(hasQuestionIntent("أي مما يلي هو التشخيص الأصح؟"), true);
  });
});

describe("answer and notes boundaries", () => {
  it("detects answer key and notes lines", () => {
    assert.equal(isAnswerKeyLine("Answer: A"), true);
    assert.equal(isAnswerKeyLine("Correct answer: B"), true);
    assert.equal(isNotesOrExplanationLine("Notes:"), true);
    assert.equal(isNotesOrExplanationLine("Explanation -"), true);
    assert.equal(isMcqBlockBoundaryLine("Answer: C"), true);
    assert.equal(isAnswerKeyLine("A) Option"), false);
  });

  it("trims blocks before answer keys and notes", () => {
    const lines = [
      { text: "11. Teenager with leg pain?" },
      { text: "A) Osteoid osteoma" },
      { text: "B) Ewing sarcoma" },
      { text: "C) Septic arthritis" },
      { text: "Answer: A" },
      { text: "Notes: - Osteoid osteomas are benign" },
      { text: "12. Next question?" },
    ];
    assert.equal(trimMcqBlockEndIndex(lines, 0, lines.length - 1), 3);
  });
});

async function createPdfWithLines(lines: string[]): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, index) => {
    page.drawText(line, { x: 72, y: 720 - index * 24, size: 12, font });
  });
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("extractSourceChunksFromPdfInProcess fallbacks", () => {
  it("chunks Q-prefixed and parenthesized question numbers", async () => {
    const bytes = await createPdfWithLines([
      "Q1. Which organ produces insulin?",
      "A) Liver",
      "B) Pancreas",
      "C) Kidney",
      "D) Spleen",
    ]);
    const chunks = await extractSourceChunksFromPdfInProcess(bytes);
    assert.equal(chunks.length, 1);
    assert.match(chunks[0]!.text, /insulin/i);
  });

  it("chunks option-only blocks without numbered stems", async () => {
    const bytes = await createPdfWithLines([
      "Which vaccine is recommended for adults?",
      "A) Live attenuated",
      "B) Inactivated",
      "C) Placebo",
      "D) None",
    ]);
    const chunks = await extractSourceChunksFromPdfInProcess(bytes);
    assert.equal(chunks.length, 1);
    assert.match(chunks[0]!.text, /vaccine/i);
  });

  it("chunks repeated unnumbered recall blocks separated by answers", async () => {
    const bytes = await createPdfWithLines([
      "Which of the following is the most appropriate management?",
      "A. Myomectomy",
      "B. Hysterectomy",
      "C. Endometrial ablation",
      "D. Progesterone therapy",
      "Answer: B",
      "Discussed before",
      "A 35-year-old woman with heavy menstruation. Which of the following is the next step?",
      "A. Myomectomy",
      "B. Correct the anemia",
      "C. Oral contraceptive pills",
      "D. Uterine artery embolization",
      "Answer: B",
      "A young woman has chronic pelvic pain. What is the best next step in management?",
      "A. Myomectomy",
      "B. Uterine artery ablation",
    ]);
    const chunks = await extractSourceChunksFromPdfInProcess(bytes);
    assert.equal(chunks.length, 3);
    assert.match(chunks[1]!.text, /35-year-old/);
    assert.match(chunks[2]!.text, /young woman/);
  });

  it("does not turn numbered score notes into question chunks", async () => {
    const bytes = await createPdfWithLines([
      "Examiner 2: 96-97%",
      "Assuming Gyn Has 50 Question",
      "1 Mistake Will Be 2%",
      "2 Mistakes Will Be 4%",
    ]);
    const chunks = await extractSourceChunksFromPdfInProcess(bytes);
    assert.equal(chunks.length, 0);
  });

  it("excludes answer keys and notes from question block highlights", async () => {
    const bytes = await createPdfWithLines([
      "11. Teenager with leg pain at night?",
      "A) Osteoid osteoma",
      "B) Ewing sarcoma",
      "C) Septic arthritis",
      "Answer: A",
      "Notes: - Osteoid osteomas are benign",
      "12. Next question stem?",
      "A) One",
      "B) Two",
      "C) Three",
      "D) Four",
    ]);
    const chunks = await extractSourceChunksFromPdfInProcess(bytes);
    assert.equal(chunks.length, 2);
    assert.match(chunks[0]!.text, /leg pain/i);
    assert.doesNotMatch(chunks[0]!.text, /Osteoid osteomas are benign/i);
    assert.doesNotMatch(chunks[0]!.text, /Answer:/i);
    assert.ok(chunks[0]!.region.height < 0.2);
  });

  it("uses stable page block ids for model source references", async () => {
    const bytes = await createPdfWithLines([
      "1. Which organ produces insulin?",
      "A) Liver",
      "B) Pancreas",
      "C) Kidney",
      "D) Spleen",
      "2. What is the first-line imaging test?",
      "A) X-ray",
      "B) Ultrasound",
      "C) MRI",
      "D) CT",
    ]);
    const chunks = await extractSourceChunksFromPdfInProcess(bytes);
    assert.deepEqual(
      chunks.map((chunk) => chunk.id),
      ["p1_b1", "p1_b2"],
    );
  });

  it("splits inline numbered question runs instead of sending one huge page block", async () => {
    const bytes = await createPdfWithLines([
      "1. Which diagnosis is most likely? A. Asthma B. COPD C. Pneumonia D. TB 2. What is the next step? A. Observe B. CT C. Antibiotics D. Surgery",
    ]);
    const chunks = await extractSourceChunksFromPdfInProcess(bytes);
    assert.equal(chunks.length, 2);
    assert.match(chunks[0]!.text, /Which diagnosis/);
    assert.match(chunks[1]!.text, /next step/);
  });
});
