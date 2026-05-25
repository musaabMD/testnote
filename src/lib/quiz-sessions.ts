export type QuizSessionRecord = {
  id: string;
  fileId: string;
  fileName: string;
  mode: "quiz" | "exam" | "flashcards";
  startedAt: number;
  finishedAt: number;
  correct: number;
  total: number;
  durationMs: number;
};

export type QuestionFeedbackRecord = {
  id: string;
  fileId: string;
  questionId: string;
  questionText: string;
  tags: string[];
  imageNotRelevant?: boolean;
  freeText?: string;
  createdAt: number;
};

export const PDF_QUIZ_SESSIONS_KEY = "drnote-pdf-quiz-sessions";
export const PDF_QUESTION_FEEDBACK_KEY = "drnote-pdf-question-feedback";

export const FEEDBACK_QUALITY_TAGS = [
  "Wrong answer key",
  "Answer from file vs AI mismatch",
  "Poor explanation",
  "No explanation added",
  "Missing choices",
  "Grammar incorrect",
  "Question may be incorrect",
  "Image irrelevant",
  "Image shows answer",
  "Image belongs to another question",
  "Question text garbled",
  "Fewer than 4 choices",
  "Duplicate question",
  "Outdated content",
  "Too easy",
  "Too hard",
] as const;

export function loadQuizSessions(): QuizSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PDF_QUIZ_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuizSessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getQuizSession(sessionId: string): QuizSessionRecord | null {
  return loadQuizSessions().find((session) => session.id === sessionId) ?? null;
}

export function saveQuizSession(session: QuizSessionRecord) {
  if (typeof window === "undefined") return;
  const next = [session, ...loadQuizSessions()].slice(0, 100);
  window.localStorage.setItem(PDF_QUIZ_SESSIONS_KEY, JSON.stringify(next));
}

export function loadQuestionFeedback(): QuestionFeedbackRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PDF_QUESTION_FEEDBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuestionFeedbackRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQuestionFeedback(feedback: QuestionFeedbackRecord) {
  if (typeof window === "undefined") return;
  const next = [feedback, ...loadQuestionFeedback()].slice(0, 500);
  window.localStorage.setItem(PDF_QUESTION_FEEDBACK_KEY, JSON.stringify(next));
}
