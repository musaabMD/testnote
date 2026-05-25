import { getOptions } from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem, PdfMcq } from "@/lib/pdf-mcqs";
import type { QuestionEditRecord } from "@/lib/question-edits";
import { getRawQuestionText, isPlaceholderOptionText, isUsableOptionText } from "@/lib/question-text";

export const MIN_QUIZ_CHOICES = 4;

export function getEffectiveOptions(
  question: PdfMcq,
  edit?: QuestionEditRecord,
): Array<{ label: string; text: string }> {
  if (edit?.options?.length) {
    return edit.options.map((option) => ({
      label: option.label,
      text: option.text.trim(),
    }));
  }
  return getOptions(question);
}

export function countUsableOptions(
  question: PdfMcq,
  edit?: QuestionEditRecord,
): number {
  return getEffectiveOptions(question, edit).filter((option) =>
    isUsableOptionText(option.text),
  ).length;
}

export function questionNeedsChoicePrep(
  question: PdfMcq,
  edit?: QuestionEditRecord,
): boolean {
  const options = getEffectiveOptions(question, edit);
  if (!options.length) return Boolean(getRawQuestionText(question));
  if (options.length < MIN_QUIZ_CHOICES) return true;
  return options.some((option) => isPlaceholderOptionText(option.text));
}

export function ensureFourOptionSlots(
  options: Array<{ label: string; text: string }>,
): Array<{ label: string; text: string }> {
  const result = options.map((option, index) => ({
    label: option.label.trim() || String.fromCharCode(65 + index),
    text: option.text.trim(),
  }));

  while (result.length < MIN_QUIZ_CHOICES) {
    result.push({
      label: String.fromCharCode(65 + result.length),
      text: "Something else",
    });
  }

  return result.slice(0, MIN_QUIZ_CHOICES);
}

export function isQuizReadyQuestion(
  question: PdfMcq,
  edit?: QuestionEditRecord,
): boolean {
  return countUsableOptions(question, edit) >= MIN_QUIZ_CHOICES;
}

export function filterQuizQuestions(
  file: PdfFileQueueItem,
  questions: PdfMcq[],
  questionEdits: Record<string, QuestionEditRecord>,
  getQuestionId: (file: PdfFileQueueItem, question: PdfMcq, index: number) => string,
): PdfMcq[] {
  return questions.filter((question, index) => {
    const questionId = getQuestionId(file, question, index);
    return isQuizReadyQuestion(question, questionEdits[questionId]);
  });
}

export function summarizeQuizReadiness(
  file: PdfFileQueueItem,
  questions: PdfMcq[],
  questionEdits: Record<string, QuestionEditRecord>,
  getQuestionId: (file: PdfFileQueueItem, question: PdfMcq, index: number) => string,
) {
  let ready = 0;
  let needsPrep = 0;
  let missingStem = 0;

  questions.forEach((question, index) => {
    const questionId = getQuestionId(file, question, index);
    const edit = questionEdits[questionId];
    if (!getRawQuestionText(question) && !edit?.questionText?.trim()) {
      missingStem += 1;
      return;
    }
    if (isQuizReadyQuestion(question, edit)) {
      ready += 1;
      return;
    }
    needsPrep += 1;
  });

  return {
    total: questions.length,
    ready,
    needsPrep,
    missingStem,
  };
}
