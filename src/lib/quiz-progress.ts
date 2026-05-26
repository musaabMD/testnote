import { touchStudyActivity } from "./study-activity";

export type QuizProgressRecord = {
  fileId: string;
  index: number;
  updatedAt: number;
};

export const PDF_QUIZ_PROGRESS_KEY = "drnote-pdf-quiz-progress-v1";

export function loadQuizProgress(fileId: string): QuizProgressRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PDF_QUIZ_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, QuizProgressRecord>;
    const record = parsed[fileId];
    if (!record || typeof record.index !== "number") return null;
    return record;
  } catch {
    return null;
  }
}

export function saveQuizProgress(fileId: string, index: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PDF_QUIZ_PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, QuizProgressRecord>) : {};
    parsed[fileId] = { fileId, index, updatedAt: Date.now() };
    window.localStorage.setItem(PDF_QUIZ_PROGRESS_KEY, JSON.stringify(parsed));
    touchStudyActivity();
  } catch {
    // ignore quota / private browsing
  }
}

export function clearQuizProgress(fileId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PDF_QUIZ_PROGRESS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, QuizProgressRecord>;
    delete parsed[fileId];
    window.localStorage.setItem(PDF_QUIZ_PROGRESS_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}
