import type { PdfFileQueueItem } from "./pdf-mcqs";
import { loadQuizAnswers } from "./pdf-view-storage";
import { PDF_QUIZ_PROGRESS_KEY } from "./quiz-progress";
import { loadQuizSessions } from "./quiz-sessions";
import { loadStudyDayKeys } from "./study-activity";

export type FileProgressStat = {
  fileId: string;
  fileName: string;
  answered: number;
  total: number;
  progress: number;
};

function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function collectStudyDayKeys() {
  const dayKeys = loadStudyDayKeys();

  for (const session of loadQuizSessions()) {
    dayKeys.add(dayKey(session.finishedAt));
    dayKeys.add(dayKey(session.startedAt));
  }

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(PDF_QUIZ_PROGRESS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { updatedAt?: number }>;
        for (const record of Object.values(parsed)) {
          if (typeof record?.updatedAt === "number") {
            dayKeys.add(dayKey(record.updatedAt));
          }
        }
      }
    } catch {
      // ignore invalid storage
    }
  }

  return dayKeys;
}

export function computeStudyStreak(now = Date.now()): number {
  const dayKeys = collectStudyDayKeys();
  if (dayKeys.size === 0) return 0;

  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  while (dayKeys.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function computeOverallScore(files: PdfFileQueueItem[]): number {
  if (!files.length) return 0;

  const answers = loadQuizAnswers();
  let totalAnswered = 0;
  let totalCorrect = 0;

  for (const file of files) {
    const total = file.result.mcqs.length;
    if (total <= 0) continue;
    const fileAnswers = answers[file.id] ?? {};
    const answered = Object.keys(fileAnswers).length;
    const correct = Object.values(fileAnswers).filter((item) => item.isCorrect).length;

    totalAnswered += answered;
    totalCorrect += correct;
  }

  if (totalAnswered <= 0) return 0;
  return Math.round((totalCorrect / totalAnswered) * 100);
}

export function getFileProgressStats(files: PdfFileQueueItem[]): FileProgressStat[] {
  const answers = loadQuizAnswers();

  return files
    .map((file) => {
      const total = file.result.mcqs.length;
      const answered = Object.keys(answers[file.id] ?? {}).length;
      const progress = total > 0 ? Math.round((answered / total) * 100) : 0;

      return {
        fileId: file.id,
        fileName: file.name,
        answered,
        total,
        progress,
      };
    })
    .sort((a, b) => b.progress - a.progress || a.fileName.localeCompare(b.fileName));
}

export function getAnsweredQuestionCount(files: PdfFileQueueItem[]): number {
  const answers = loadQuizAnswers();
  return files.reduce(
    (sum, file) => sum + Object.keys(answers[file.id] ?? {}).length,
    0,
  );
}

export function getTotalQuestionCount(files: PdfFileQueueItem[]): number {
  return files.reduce((sum, file) => sum + file.result.mcqs.length, 0);
}
