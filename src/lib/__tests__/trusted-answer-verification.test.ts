import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getTrustedAnswerVerification,
  isOcrMissingAnswerNote,
} from "../trusted-answer-verification.ts";

describe("trusted-answer-verification", () => {
  it("matches the Saudi one-year immunization schedule question", () => {
    const verification = getTrustedAnswerVerification(
      {
        questionText:
          "A 1-year-old infant presents to the Vaccination Clinic with a normal exam and growth. What are the recommended vaccines according to the national program?",
      },
      [
        { label: "A", text: "OPV, MMR, HAV, PCV" },
        { label: "B", text: "varicella, PCV, HIB" },
        { label: "C", text: "OPV, MMR, varicella, PCV" },
      ],
    );

    assert.ok(verification);
    assert.equal(verification.answer, "OPV, MMR, PCV, and MCV4.");
    assert.match(verification.referenceLabel, /Saudi Ministry of Health/);
    assert.match(verification.quote, /PCV/);
    assert.match(verification.quote, /MCV4/);
    assert.equal(verification.choiceExplanations.length, 3);
    assert.deepEqual(
      verification.choiceExplanations.map((choice) => choice.isCorrect),
      [false, false, false],
    );
    assert.match(verification.choiceExplanations[0]!.reason, /missing MCV4/);
    assert.match(verification.choiceExplanations[0]!.reason, /adds HAV/);
    assert.match(verification.choiceExplanations[1]!.reason, /missing OPV, MMR, and MCV4/);
  });

  it("detects OCR missing-answer placeholders", () => {
    assert.equal(isOcrMissingAnswerNote("Answer not clearly present in OCR source."), true);
  });

  it("matches dengue transmission questions to an official reference", () => {
    const verification = getTrustedAnswerVerification(
      {
        questionText: "Dengue fever transmitted?",
      },
      [
        { label: "A", text: "Mosquito bite" },
        { label: "B", text: "droplet" },
        { label: "C", text: "body fluid" },
        { label: "D", text: "contaminated food and water" },
      ],
    );

    assert.ok(verification);
    assert.equal(verification.answer, "Mosquito bite.");
    assert.match(verification.referenceLabel, /CDC/);
    assert.match(verification.referenceUrl, /cdc\.gov\/dengue\/transmission/);
    assert.deepEqual(
      verification.choiceExplanations.map((choice) => choice.isCorrect),
      [true, false, false, false],
    );
    assert.match(verification.choiceExplanations[1]!.reason, /droplet/);
    assert.match(verification.choiceExplanations[3]!.reason, /food or water/);
  });
});
