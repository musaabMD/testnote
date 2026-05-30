import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitChunksIntoBatches } from "../chunk-batch.server.ts";
import { coercePdfMcqResult } from "../pdf-mcqs.ts";
import { extractMcqsFromMistralOcrPages } from "../ocr-mcq-extraction.server.ts";
import type { SourceChunk } from "../highlightable-source.ts";

describe("source-first model output coercion", () => {
  it("accepts DrNote source-first question JSON", () => {
    const result = coercePdfMcqResult({
      title: "Gynecology MCQs",
      summary: "Leiomyoma management questions",
      document_has_questions: true,
      distinct_question_count: 1,
      questions: [
        {
          question_id_temp: "q1",
          type: "extracted",
          page_number: 4,
          source_block_ids: ["p4_b1"],
          source_snippet: "A 35-year-old woman with a leiomyoma",
          question_number_original: "40",
          stem: "A 35-year-old woman has heavy menstruation. What is the next step?",
          options: {
            A: "Myomectomy",
            B: "Correct the anemia",
            C: "Oral contraceptive pills",
            D: "Uterine artery embolization",
          },
          answer: {
            label: "B",
            text: "Correct the anemia",
            found_in_source: true,
          },
        },
      ],
    });

    assert.ok(result);
    assert.equal(result.title, "Gynecology MCQs");
    assert.equal(result.mcqs[0]?.questionNumber, 40);
    assert.equal(result.mcqs[0]?.sourcePage, 4);
    assert.deepEqual(result.mcqs[0]?.sourceChunkIds, ["p4_b1"]);
    assert.equal(result.mcqs[0]?.exactQuote, "A 35-year-old woman with a leiomyoma");
    assert.equal(result.mcqs[0]?.correctAnswer, "B");
    assert.equal(result.mcqs[0]?.answer, "Correct the anemia");
  });
});

describe("Mistral OCR source-first extraction", () => {
  it("extracts numbered OCR questions without an OpenRouter model response", () => {
    const { result, sourceChunks } = extractMcqsFromMistralOcrPages({
      fileHash: "file1",
      fileName: "Recall.pdf",
      pages: [
        {
          index: 0,
          markdown: `1. Which organ produces insulin?
A. Liver
B. Pancreas (correct)
C. Kidney
D. Spleen

2. Patient with occupational hearing loss. What frequency is affected?
A. 1KHz
B. 2KHz
C. 4KHz`,
        },
      ],
    });

    assert.equal(result.mcqs.length, 2);
    assert.equal(result.mcqs[0]?.questionNumber, 1);
    assert.equal(result.mcqs[0]?.correctAnswer, "B");
    assert.equal(result.mcqs[1]?.sourcePage, 1);
    assert.deepEqual(result.mcqs[1]?.sourceChunkIds, ["file1-ocr-p1-q2"]);
    assert.equal(sourceChunks.length, 2);
  });

  it("normalizes Arabic-Indic question numbers from OCR text", () => {
    const { result } = extractMcqsFromMistralOcrPages({
      fileHash: "file2",
      fileName: "Arabic.pdf",
      pages: [
        {
          index: 0,
          markdown: "‫‪١٥٠.‬‬ Q\n‫‪١٥١.‬‬ Case scenario of a worker in a plastic factory",
        },
      ],
    });

    assert.deepEqual(
      result.mcqs.map((mcq) => mcq.questionNumber),
      [150, 151],
    );
  });

  it("extracts unnumbered recall questions with plain option lines", () => {
    const { result } = extractMcqsFromMistralOcrPages({
      fileHash: "recall1",
      fileName: "April Recall.pdf",
      pages: [
        {
          index: 0,
          markdown: `Dengue fever transmitted?
Mosquito bite
Droplet
Body fluid
Contaminated food and water

21 year old male patient young on 2 antiHTN. BP is still high. Family history of death and stroke at young age. BMI 21. What test would you order to confirm the diagnosis?
Renin angiotensin
24 urine cortisol
Plasma catecholamines
Urine metanephrines

Woman with cancer coming for preoperative assessment with low appetite and weight loss and asking about nutrition
NGT
Parenteral
Oral supplement`,
        },
      ],
    });

    assert.equal(result.mcqs.length, 3);
    assert.equal(result.mcqs[0]?.questionText, "Dengue fever transmitted?");
    assert.deepEqual(
      result.mcqs[0]?.options?.map((option) => option.text),
      ["Mosquito bite", "Droplet", "Body fluid", "Contaminated food and water"],
    );
    assert.equal(
      result.mcqs[1]?.options?.at(3)?.text,
      "Urine metanephrines",
    );
    assert.equal(result.mcqs[2]?.options?.length, 3);
  });

  it("keeps a question when its choices continue on the next OCR page", () => {
    const { result, sourceChunks } = extractMcqsFromMistralOcrPages({
      fileHash: "split1",
      fileName: "Split Recall.pdf",
      pages: [
        {
          index: 0,
          markdown: `Teenage girl sits on her ipad a lot and keeps comparing herself with others, she has low self esteem and anxiety,
what's the most she could benefit from?
Antidepressant
Force her to leave social media
Limit social media time
Cognitive behavioral therapy

Pt female came for birth control she had previous DVT, what contraception u give?`,
        },
        {
          index: 1,
          markdown: `PatchB- IUD
OCP

A patient underwent a dental procedure and subsequently develops jaundice and chills.
Ultrasound reveals a 6 cm hypoechoic lesion in the liver. What is the most appropriate initial management?
Oral antibiotics
Percutaneous drainage`,
        },
      ],
    });

    assert.equal(result.mcqs.length, 3);
    assert.match(result.mcqs[1]?.questionText ?? "", /previous DVT/);
    assert.deepEqual(
      result.mcqs[1]?.options?.map((option) => option.text),
      ["PatchB- IUD", "OCP"],
    );
    assert.equal(result.mcqs[1]?.sourcePage, 1);
    assert.match(sourceChunks[1]?.text ?? "", /PatchB- IUD\nOCP/);
    assert.match(result.mcqs[2]?.questionText ?? "", /dental procedure/);
  });
});

describe("source chunk batching", () => {
  it("defaults to four-page source windows", () => {
    const chunks: SourceChunk[] = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index + 1}_b1`,
      pageNumber: index + 1,
      text: `${index + 1}. Question? A. One B. Two C. Three D. Four`,
      region: {
        pageNumber: index + 1,
        x: 0.1,
        y: 0.1,
        width: 0.8,
        height: 0.1,
        sourceKind: "question-block",
        method: "pdf-layout",
      },
    }));

    const batches = splitChunksIntoBatches(chunks);

    assert.equal(batches.length, 2);
    assert.deepEqual(
      batches.map((batch) => [...new Set(batch.chunks.map((chunk) => chunk.pageNumber))]),
      [[1, 2, 3, 4], [5, 6]],
    );
  });
});
