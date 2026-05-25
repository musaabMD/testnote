export type QuestionEditRecord = {
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
};

export const PDF_QUESTION_EDITS_KEY = "drnote-pdf-question-edits";

export function loadQuestionEdits(): Record<string, Record<string, QuestionEditRecord>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PDF_QUESTION_EDITS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, QuestionEditRecord>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveQuestionEdit(
  fileId: string,
  questionId: string,
  edit: QuestionEditRecord,
) {
  if (typeof window === "undefined") return;
  const all = loadQuestionEdits();
  const fileEdits = { ...(all[fileId] ?? {}), [questionId]: edit };
  window.localStorage.setItem(
    PDF_QUESTION_EDITS_KEY,
    JSON.stringify({ ...all, [fileId]: fileEdits }),
  );
}
