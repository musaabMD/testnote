import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitChunksIntoBatches } from "../chunk-batch.server.ts";
import { coercePdfMcqResult } from "../pdf-mcqs.ts";
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
