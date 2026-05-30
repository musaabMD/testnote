import type { PdfMcq } from "@/lib/pdf-mcqs";

export type TrustedAnswerVerification = {
  answer: string;
  explanation: string;
  choiceExplanations: Array<{
    label: string;
    text: string;
    isCorrect: boolean;
    reason: string;
  }>;
  referenceLabel: string;
  referenceUrl: string;
  quote: string;
};

const SAUDI_MOH_IMMUNIZATION_SCHEDULE_URL =
  "https://www.moh.gov.sa/en/healthawareness/educationalcontent/healthtips/documents/immunization-schedule.pdf";
const CDC_DENGUE_TRANSMISSION_URL =
  "https://www.cdc.gov/dengue/transmission/index.html";

const OCR_MISSING_ANSWER_NOTE = "answer not clearly present in ocr source";

export function isOcrMissingAnswerNote(note: string): boolean {
  return normalizeText(note).replace(/[.。]+$/, "") === OCR_MISSING_ANSWER_NOTE;
}

export function getTrustedAnswerVerification(
  question: PdfMcq,
  options: Array<{ label: string; text: string }> = [],
): TrustedAnswerVerification | null {
  const text = normalizeText(
    [
      question.questionText,
      question.question,
      question.exactQuote,
      ...options.map((option) => option.text),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (isDengueTransmissionQuestion(text)) {
    return {
      answer: "Mosquito bite.",
      explanation:
        "Dengue is transmitted primarily through the bite of infected Aedes mosquitoes. Droplets, routine body-fluid contact, and contaminated food or water are not the usual transmission routes for dengue.",
      choiceExplanations: buildDengueTransmissionChoiceExplanations(options),
      referenceLabel: "CDC, How Dengue Spreads",
      referenceUrl: CDC_DENGUE_TRANSMISSION_URL,
      quote: 'CDC: "Through mosquito bites" from infected Aedes species mosquitoes.',
    };
  }

  if (!isSaudiOneYearImmunizationQuestion(text)) return null;

  return {
    answer: "OPV, MMR, PCV, and MCV4.",
    explanation:
      "The Saudi national schedule lists OPV, MMR, PCV, and MCV4 at 12 months. HAV and varicella are scheduled later, so none of the shown options is a fully exact match to the current official schedule.",
    choiceExplanations: buildSaudiOneYearChoiceExplanations(options),
    referenceLabel:
      "Saudi Ministry of Health, National Immunization Schedule, childhood schedule table, p. 1",
    referenceUrl: SAUDI_MOH_IMMUNIZATION_SCHEDULE_URL,
    quote: 'Source table cells: "12 months", "PCV", "OPV", "MCV4", "MMR".',
  };
}

function buildDengueTransmissionChoiceExplanations(
  options: Array<{ label: string; text: string }>,
): TrustedAnswerVerification["choiceExplanations"] {
  return options.map((option) => {
    const normalized = normalizeText(option.text);
    const isCorrect = /\bmosquito\b|\baedes\b|\bbite\b/.test(normalized);

    if (isCorrect) {
      return {
        label: option.label,
        text: option.text,
        isCorrect,
        reason:
          "Correct: dengue is spread mainly by the bite of an infected Aedes mosquito.",
      };
    }

    let reason =
      "Incorrect: this is not the usual route of dengue transmission; dengue is primarily mosquito-borne.";
    if (/\bdroplet\b|\bairborne\b|\bcough\b|\bsneeze\b/.test(normalized)) {
      reason =
        "Incorrect: dengue is not a respiratory droplet infection; it is primarily spread by infected Aedes mosquitoes.";
    } else if (/\bfood\b|\bwater\b|\bcontaminat/.test(normalized)) {
      reason =
        "Incorrect: dengue is not transmitted through contaminated food or water; mosquito bites are the primary route.";
    } else if (/\bbody\b|\bfluid\b|\bblood\b/.test(normalized)) {
      reason =
        "Incorrect for routine transmission: rare blood-related exposures can occur, but the standard route tested here is mosquito bite.";
    }

    return {
      label: option.label,
      text: option.text,
      isCorrect,
      reason,
    };
  });
}

function buildSaudiOneYearChoiceExplanations(
  options: Array<{ label: string; text: string }>,
): TrustedAnswerVerification["choiceExplanations"] {
  return options.map((option) => {
    const found = getVaccineTokens(option.text);
    const missing = ["OPV", "MMR", "PCV", "MCV4"].filter(
      (vaccine) => !found.includes(vaccine),
    );
    const extra = found.filter((vaccine) => !["OPV", "MMR", "PCV", "MCV4"].includes(vaccine));
    const isCorrect = missing.length === 0 && extra.length === 0;

    if (isCorrect) {
      return {
        label: option.label,
        text: option.text,
        isCorrect,
        reason: "Correct: this exactly matches the 12-month Saudi MOH row.",
      };
    }

    const parts = [
      missing.length ? `is missing ${joinList(missing)}` : "",
      extra.length ? `adds ${joinList(extra)}` : "",
    ].filter(Boolean);

    return {
      label: option.label,
      text: option.text,
      isCorrect,
      reason: `Incorrect: it ${parts.join(" and ")}; the 12-month row is OPV, MMR, PCV, and MCV4.`,
    };
  });
}

function getVaccineTokens(text: string): string[] {
  const normalized = normalizeText(text);
  const tokens: string[] = [];

  if (/\bopv\b/.test(normalized)) tokens.push("OPV");
  if (/\bmmr\b/.test(normalized)) tokens.push("MMR");
  if (/\bpcv\b/.test(normalized)) tokens.push("PCV");
  if (/\b(?:mcv\s*4|4\s*mcv|mcv4|4mcv)\b/.test(normalized)) tokens.push("MCV4");
  if (/\b(?:hav|hepa|hep\s*a|hepatitis\s*a)\b/.test(normalized)) tokens.push("HAV");
  if (/\bvaricella\b/.test(normalized)) tokens.push("varicella");
  if (/\bhib\b/.test(normalized)) tokens.push("Hib");

  return [...new Set(tokens)];
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function isSaudiOneYearImmunizationQuestion(text: string): boolean {
  const asksAboutInfantAge =
    /\b(?:1|one)[-\s]?year[-\s]?old\b/.test(text) ||
    /\b12\s*months?\b/.test(text);
  const asksAboutVaccinationProgram =
    /\bvaccin/.test(text) &&
    /\b(?:national|program|schedule|immunization)\b/.test(text);
  const hasScheduleChoices =
    /\bopv\b/.test(text) &&
    /\bmmr\b/.test(text) &&
    /\bpcv\b/.test(text);

  return asksAboutInfantAge && asksAboutVaccinationProgram && hasScheduleChoices;
}

function isDengueTransmissionQuestion(text: string): boolean {
  const asksDengue = /\bdengue\b/.test(text);
  const asksTransmission =
    /\btransmit|\bspread|\broute|\binfect/.test(text);
  const hasMosquitoChoice = /\bmosquito\b|\baedes\b|\bbite\b/.test(text);
  const hasDistractor =
    /\bdroplet\b|\bbody\s*fluid\b|\bfood\b|\bwater\b|\bcontaminat/.test(text);

  return asksDengue && asksTransmission && hasMosquitoChoice && hasDistractor;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
