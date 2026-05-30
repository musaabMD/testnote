import {
  getCorrectAnswer,
  getNotes,
  getOptions,
  getQuestionText,
  optionMatchesAnswer,
} from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem, PdfMcq } from "@/lib/pdf-mcqs";
import { cleanExplanationText } from "@/lib/question-text";
import {
  getTrustedAnswerVerification,
  isOcrMissingAnswerNote,
  type TrustedAnswerVerification,
} from "@/lib/trusted-answer-verification";

export type ChoiceExplanation = {
  label: string;
  text: string;
  isCorrect: boolean;
  reason: string;
};

export function hasUsableExplanationNotes(notes: string[]): boolean {
  return getCleanUsableNotes(notes).length > 0;
}

function takeFirstSentences(text: string, maxSentences = 2, maxChars = 220): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;

  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [trimmed];
  let result = "";

  for (const sentence of sentences.slice(0, maxSentences)) {
    const next = result ? `${result} ${sentence.trim()}` : sentence.trim();
    if (next.length > maxChars) break;
    result = next;
  }

  if (result) return result;
  return `${trimmed.slice(0, maxChars).trim()}…`;
}

/** One short Duolingo-style line for inline quiz feedback. */
export function getShortQuizFeedback(
  options: Array<{ label: string; text: string }>,
  correctAnswer: string,
  notes: string[],
  isCorrect: boolean,
  selectedLabel?: string,
): string {
  const breakdown = buildChoiceExplanations(options, correctAnswer, notes);
  const correctChoice = breakdown.find((item) => item.isCorrect);
  const selectedChoice = selectedLabel
    ? breakdown.find((item) => item.label === selectedLabel)
    : undefined;

  if (!isCorrect && selectedChoice?.reason && !selectedChoice.isCorrect) {
    return takeFirstSentences(selectedChoice.reason);
  }

  if (correctChoice?.reason) {
    return takeFirstSentences(correctChoice.reason);
  }

  const cleanedNotes = getCleanUsableNotes(notes);
  if (cleanedNotes[0]) {
    return takeFirstSentences(cleanedNotes[0]);
  }

  if (!isCorrect && correctChoice) {
    return `The correct answer is ${correctChoice.label}. ${correctChoice.text}.`;
  }

  return "";
}

export function buildChoiceExplanations(
  options: Array<{ label: string; text: string }>,
  correctAnswer: string,
  notes: string[],
): ChoiceExplanation[] {
  const cleanedNotes = getCleanUsableNotes(notes);
  const generalNote = cleanedNotes[0] ?? "";

  return options.map((option) => {
    const isCorrect = optionMatchesAnswer(option, correctAnswer);
    const noteHint = findNoteForOption(option.text, cleanedNotes);

    let reason = "";
    if (noteHint) {
      reason = noteHint;
    } else if (isCorrect && generalNote) {
      reason = generalNote;
    }

    return {
      label: option.label,
      text: option.text,
      isCorrect,
      reason,
    };
  });
}

function findNoteForOption(optionText: string, notes: string[]) {
  const normalized = optionText.toLowerCase();
  const fragments = [
    normalized,
    ...normalized.split(/\s+/).filter((word) => word.length >= 5),
  ];

  return notes.find((note) => {
    const lower = note.toLowerCase();
    return fragments.some((fragment) => fragment.length >= 4 && lower.includes(fragment));
  });
}

export function formatChoiceBreakdownMarkdown(
  question: PdfMcq,
  options: Array<{ label: string; text: string }>,
  correctAnswer: string,
  notes: string[],
): string {
  const cleanedNotes = getCleanUsableNotes(notes);
  if (!cleanedNotes.length) return "";

  const items = buildChoiceExplanations(options, correctAnswer, cleanedNotes);
  const correctItems = items.filter((item) => item.isCorrect);
  const intro =
    cleanedNotes[0] ??
    (correctItems[0]
      ? `The documented answer is **${correctItems[0].label}. ${correctItems[0].text}**.`
      : "Notes from your file:");

  const bullets = items
    .map((item) => {
      const icon = item.isCorrect ? "✅" : "❌";
      if (item.reason) {
        return `${icon} **${item.label}. ${item.text}** — ${item.reason}`;
      }
      return `${icon} **${item.label}. ${item.text}**`;
    })
    .join("\n");

  return [intro, "", bullets]
    .filter(Boolean)
    .join("\n");
}

function formatTrustedVerificationMarkdown(
  trustedVerification: TrustedAnswerVerification,
): string {
  const bullets = trustedVerification.choiceExplanations
    .map((item) => {
      const icon = item.isCorrect ? "✅" : "❌";
      return `${icon} **${item.label}. ${item.text}** — ${item.reason}`;
    })
    .join("\n");

  return [
    `Verified answer: **${trustedVerification.answer}**`,
    trustedVerification.explanation,
    "",
    bullets,
    "",
    `Reference: ${trustedVerification.referenceLabel}`,
    trustedVerification.referenceUrl,
  ]
    .filter(Boolean)
    .join("\n");
}

function getCleanUsableNotes(notes: string[]): string[] {
  return notes
    .map(cleanExplanationText)
    .filter((note) => note && !isOcrMissingAnswerNote(note));
}

export function buildQuizWelcomeMessage(question: PdfMcq): string {
  const notes = getNotes(question).map(cleanExplanationText).filter(Boolean);
  const options = getOptions(question);
  const correctAnswer = getCorrectAnswer(question);
  const trustedVerification = getTrustedAnswerVerification(question, options);

  if (trustedVerification) {
    return formatTrustedVerificationMarkdown(trustedVerification);
  }

  if (hasUsableExplanationNotes(notes) && options.length) {
    const fromNotes = formatChoiceBreakdownMarkdown(
      question,
      options,
      correctAnswer,
      notes,
    );
    if (fromNotes) return fromNotes;
  }

  const stem = getQuestionText(question);
  if (stem) {
    return `No explanation was found in your file for this question.\n\nWhen you open this chat, I'll walk through each answer choice with clinical reasoning. You can also ask follow-up questions about **${stem.slice(0, 120)}${stem.length > 120 ? "…" : ""}**.`;
  }

  return "No explanation was found in your file. Ask me to explain each answer choice and I'll reason through the question with you.";
}

export const QUIZ_AUTO_EXPLAIN_PROMPT =
  "Explain each answer choice for this question. Use clinical reasoning, mark each option with ✅ or ❌, and end with the single best answer.";

const TUTOR_STYLE_EXAMPLE = `Example of the explanation style to follow:

For a male with breast cancer receiving chemotherapy, avoid live vaccines during significant immunosuppression.

Here's the breakdown:

* ❌ **MMR** → live attenuated vaccine → generally contraindicated during chemotherapy.
* ❌ **Varicella** → live attenuated vaccine → contraindicated during chemotherapy.
* ✅ **Inactivated polio vaccine (IPV)** → safe in immunocompromised patients.
* ✅ **Inactivated influenza vaccine** → recommended and safe during chemotherapy.

The single best answer when the question asks for one vaccine to give is **inactivated influenza vaccine**.`;

export function buildQuizAssistantInstructions(question: PdfMcq): string {
  const options = getOptions(question)
    .map((option) => `${option.label}. ${option.text}`)
    .join("\n");
  const notes = getNotes(question).map(cleanExplanationText).filter(Boolean).join("\n");
  const answer = getCorrectAnswer(question);
  const hasNotes = hasUsableExplanationNotes(getNotes(question));
  const trustedVerification = getTrustedAnswerVerification(question, getOptions(question));

  return [
    "You are a medical study tutor helping a student understand one multiple-choice question.",
    "Explain every choice with real clinical reasoning — never use generic filler like 'matches the documented answer' or 'is preferred in this scenario' without explaining why.",
    "When source notes are missing or weak, do not cite Wikipedia. Use recognized textbooks, clinical guidelines, or official health authority sources, and include the reference plus a short quote when giving a verified factual answer.",
    "Use this structure:",
    "1. One-sentence clinical takeaway for the stem.",
    "2. 'Here's the breakdown:' then a bullet for each option with ✅ or ❌.",
    "3. Use '→' to connect the option to the reason (e.g. 'live attenuated → contraindicated in chemo').",
    "4. End with one clear sentence naming the single best answer.",
    hasNotes
      ? "Prefer the source notes below when they are clinically sound."
      : "No source notes were extracted — reason from the stem and choices. If the documented answer key looks clinically wrong, say so and explain what would be correct.",
    "",
    TUTOR_STYLE_EXAMPLE,
    "",
    `Question: ${getQuestionText(question)}`,
    options ? `Choices:\n${options}` : null,
    answer ? `Documented correct answer from file: ${answer}` : "No answer key was extracted from the file.",
    trustedVerification
      ? `Trusted verification:\nAnswer: ${trustedVerification.answer}\nChoice explanations:\n${trustedVerification.choiceExplanations
          .map(
            (item) =>
              `${item.isCorrect ? "Correct" : "Incorrect"} ${item.label}. ${item.text}: ${item.reason}`,
          )
          .join("\n")}\nReference: ${trustedVerification.referenceLabel}\nURL: ${trustedVerification.referenceUrl}\nQuote: ${trustedVerification.quote}\nUse this source when it conflicts with an OCR-only answer key.`
      : null,
    notes ? `Source notes:\n${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFileAskInstructions(
  file: PdfFileQueueItem,
  questions: PdfMcq[],
  options?: {
    retrievalContext?: string;
    retrievalSourceCount?: number;
  },
): string {
  const summary = file.result.summary.trim();
  const preview = questions.slice(0, 24).map((question, index) => {
    const stem = getQuestionText(question).replace(/\s+/g, " ").trim();
    const answer = getCorrectAnswer(question);
    const clipped = stem.length > 180 ? `${stem.slice(0, 180)}…` : stem;
    return `${index + 1}. ${clipped}${answer ? ` (Answer: ${answer})` : ""}`;
  });

  return [
    "You are DrNote AI, a medical study tutor.",
    `The student is studying "${file.name}" with ${questions.length} extracted MCQ${questions.length === 1 ? "" : "s"}.`,
    options?.retrievalContext
      ? [
          "Use the retrieved source excerpts below as the primary evidence for this answer.",
          "If the excerpts do not contain enough evidence, say what is missing instead of inventing details.",
          `Retrieved excerpts (${options.retrievalSourceCount ?? 0}):`,
          options.retrievalContext,
        ].join("\n")
      : [
          "No source excerpt matched the latest question strongly.",
          "Use the file summary and extracted questions only when they contain enough evidence, and say when the uploaded file does not support the answer.",
        ].join("\n"),
    summary ? `File summary:\n${summary}` : null,
    preview.length ? `Questions from the file:\n${preview.join("\n")}` : null,
    questions.length > preview.length
      ? `…and ${questions.length - preview.length} more question${questions.length - preview.length === 1 ? "" : "s"}.`
      : null,
    "Help the student summarize topics, explain concepts, identify hard questions, and study effectively.",
    "Be concise but thorough. Use markdown bullets when helpful.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
