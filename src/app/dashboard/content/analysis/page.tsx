"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import {
  getCorrectAnswer,
  getNotes,
  getOptions,
  getQuestionId,
  getQuestionText,
  studyModeHref,
} from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  formatFileMeta,
  getFilePageCount,
  getFileSubject,
  loadQuestionBookmarks,
  loadQuizAnswers,
} from "@/lib/pdf-view-storage";
import {
  buildChoiceExplanations,
  hasUsableExplanationNotes,
} from "@/lib/quiz-tutor-prompt";
import { getQuizSession, type QuizSessionRecord } from "@/lib/quiz-sessions";
import { cleanExplanationText } from "@/lib/question-text";
import { Clock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function FileAnalysisPage() {
  return (
    <FileActionPageShell title="Analysis">
      {(file) => <AnalysisContent file={file} />}
    </FileActionPageShell>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatWhen(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function sessionModeLabel(mode: QuizSessionRecord["mode"]) {
  if (mode === "exam") return "Exam";
  if (mode === "flashcards") return "Flashcards";
  return "Quiz";
}

function AnalysisContent({ file }: { file: PdfFileQueueItem }) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const session = useMemo(
    () => (sessionId ? getQuizSession(sessionId) : null),
    [sessionId],
  );

  const stats = useMemo(() => {
    const questions = file.result.mcqs;
    const answers = loadQuizAnswers()[file.id] ?? {};
    const bookmarks = new Set(loadQuestionBookmarks()[file.id] ?? []);
    const answered = Object.keys(answers).length;
    const correct = Object.values(answers).filter((item) => item.isCorrect).length;
    const incorrect = Object.values(answers).filter((item) => !item.isCorrect).length;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    const pageMap = new Map<number, number>();
    questions.forEach((question) => {
      const page = question.sourcePage ?? 1;
      pageMap.set(page, (pageMap.get(page) ?? 0) + 1);
    });

    const unanswered = questions.filter((question, index) => {
      const id = getQuestionId(file, question, index);
      return !answers[id];
    });

    const reviewItems = questions.map((question, index) => {
      const id = getQuestionId(file, question, index);
      const answer = answers[id];
      const options = getOptions(question);
      const correctAnswer = getCorrectAnswer(question);
      const notes = getNotes(question).map(cleanExplanationText).filter(Boolean);
      const breakdown = buildChoiceExplanations(options, correctAnswer, notes);
      const showBreakdown = hasUsableExplanationNotes(notes);

      return {
        id,
        index,
        text: getQuestionText(question),
        answer,
        correctAnswer,
        breakdown,
        showBreakdown,
      };
    });

    return {
      totalQuestions: questions.length,
      pages: getFilePageCount(file),
      answered,
      correct,
      incorrect,
      accuracy,
      bookmarked: bookmarks.size,
      subject: getFileSubject(file.id),
      pageBreakdown: [...pageMap.entries()].sort((a, b) => a[0] - b[0]),
      unansweredPreview: unanswered.slice(0, 5).map((question, index) => ({
        id: `${index}-${getQuestionText(question).slice(0, 24)}`,
        text: getQuestionText(question),
        answer: getCorrectAnswer(question),
      })),
      reviewItems,
    };
  }, [file]);

  const displayCorrect = session?.correct ?? stats.correct;
  const displayTotal = session?.total ?? stats.totalQuestions;
  const displayAccuracy =
    displayTotal > 0 ? Math.round((displayCorrect / displayTotal) * 100) : stats.accuracy;

  return (
    <div className="space-y-4">
      {session ? (
        <div className="rounded-[20px] border-[1.5px] border-[#D9E8F7] bg-[#F7FBFF] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#C0B8F0]">
            {sessionModeLabel(session.mode)} session
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {displayCorrect}/{displayTotal}
          </h1>
          <p className="mt-1 text-lg font-semibold text-slate-500">{displayAccuracy}% correct</p>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
            <Clock className="size-4" />
            {formatWhen(session.finishedAt)} · {formatDuration(session.durationMs)}
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {session.mode === "exam" ? (
              <Link
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-950 text-sm font-bold text-white transition hover:bg-zinc-800"
                href={studyModeHref(file.id, "exam")}
              >
                <RotateCcw className="size-4" />
                Retake exam
              </Link>
            ) : null}
            <Link
              className="flex h-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              href={studyModeHref(file.id, "review")}
            >
              Review questions
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-[20px] border-[1.5px] border-[#D9E8F7] bg-[#F7FBFF] p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight text-slate-950">Analysis</h1>
        <p className="mt-2 text-sm text-slate-500">{file.name}</p>
        <p className="mt-1 text-xs font-medium text-slate-400">{formatFileMeta(file)}</p>
        {stats.subject ? (
          <p className="mt-3 inline-flex rounded-full bg-[#EDFAF4] px-2.5 py-1 text-[11px] font-semibold text-[#1D9E75]">
            {stats.subject}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Questions" value={String(stats.totalQuestions)} />
          <StatCard label="Answered" value={String(stats.answered)} />
          <StatCard label="Accuracy" value={stats.answered ? `${stats.accuracy}%` : "—"} />
          <StatCard label="Bookmarked" value={String(stats.bookmarked)} />
        </div>
      </div>

      <div className="rounded-[20px] border-[1.5px] border-[#D9E8F7] bg-[#F7FBFF] p-6 sm:p-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#C0B8F0]">
          Progress breakdown
        </h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <BreakdownPill label="Correct" tone="green" value={stats.correct} />
          <BreakdownPill label="Incorrect" tone="red" value={stats.incorrect} />
          <BreakdownPill
            label="Not attempted"
            tone="gray"
            value={Math.max(0, stats.totalQuestions - stats.answered)}
          />
        </div>
      </div>

      {session && stats.reviewItems.some((item) => item.answer) ? (
        <div className="rounded-[20px] border-[1.5px] border-[#D9E8F7] bg-[#F7FBFF] p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#C0B8F0]">
            Question review
          </h2>
          <ul className="mt-4 space-y-4">
            {stats.reviewItems.map((item, reviewIndex) => {
              if (!item.answer) return null;

              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-[#F0F0F0] bg-[#FAFAFA] p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Question {reviewIndex + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.text}</p>
                  <p className="mt-2 text-sm font-bold text-slate-700">
                    Your answer: {item.answer.selected}{" "}
                    <span className={item.answer.isCorrect ? "text-green-600" : "text-red-500"}>
                      {item.answer.isCorrect ? "Correct" : "Incorrect"}
                    </span>
                  </p>
                  {item.correctAnswer ? (
                    <p className="mt-1 text-sm text-slate-600">
                      Best answer: {item.correctAnswer}
                    </p>
                  ) : null}
                  {item.showBreakdown ? (
                    <ul className="mt-3 space-y-1.5">
                      {item.breakdown.map((choice) => (
                        <li key={choice.label} className="text-xs text-slate-600">
                          <span className="font-semibold">
                            {choice.isCorrect ? "✅" : "❌"} {choice.label}. {choice.text}
                          </span>
                          {choice.reason ? (
                            <span className="block ps-5">→ {choice.reason}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {stats.pageBreakdown.length ? (
        <div className="rounded-[20px] border-[1.5px] border-[#D9E8F7] bg-[#F7FBFF] p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#C0B8F0]">
            Questions by page
          </h2>
          <ul className="mt-4 space-y-2">
            {stats.pageBreakdown.map(([page, count]) => (
              <li
                key={page}
                className="flex items-center justify-between rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 text-sm"
              >
                <span className="font-semibold text-slate-800">Page {page}</span>
                <span className="text-slate-500">
                  {count} question{count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!session && stats.unansweredPreview.length ? (
        <div className="rounded-[20px] border-[1.5px] border-[#D9E8F7] bg-[#F7FBFF] p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#C0B8F0]">
            Still to review
          </h2>
          <ul className="mt-4 space-y-2">
            {stats.unansweredPreview.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3"
              >
                <p className="text-sm font-semibold text-slate-800">{item.text}</p>
                {item.answer ? (
                  <p className="mt-1 text-xs text-slate-500">Answer: {item.answer}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function BreakdownPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "gray";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#B8EDD8] bg-[#EDFAF4] text-[#1D9E75]"
      : tone === "red"
        ? "border-[#F9C4D4] bg-[#FFF0F4] text-[#D4537E]"
        : "border-[#F0F0F0] bg-white text-slate-600";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.06em] opacity-80">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}
