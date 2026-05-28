"use client";

import {
  getCorrectAnswer,
  getQuestionId,
  getQuestionText,
  optionMatchesAnswer,
  type QuestionAnswer,
} from "@/components/pdf/pdf-study-panel";
import { useStudySessionChromeOptional } from "@/components/pdf/study-session-chrome";
import type { PdfFileQueueItem, PdfMcq } from "@/lib/pdf-mcqs";
import {
  loadQuestionEdits,
  saveQuestionEdit,
  type QuestionEditRecord,
} from "@/lib/question-edits";
import { getRawQuestionText } from "@/lib/question-text";
import {
  ensureFourOptionSlots,
  filterQuizQuestions,
  getEffectiveOptions,
  questionNeedsChoicePrep,
  summarizeQuizReadiness,
} from "@/lib/quiz-questions";
import { saveQuizSession } from "@/lib/quiz-sessions";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  List,
  Timer,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ExamQuestion = {
  id: number;
  text: string;
  options: string[];
  correct: number;
  sourceQuestion: PdfMcq;
  sourceIndex: number;
};

const labels = ["A", "B", "C", "D"];

import { APP_LOGO_URL, APP_NAME } from "@/lib/site-branding";

function filterValidQuestions(
  file: PdfFileQueueItem,
  questions: PdfMcq[],
  questionEdits: Record<string, QuestionEditRecord>,
) {
  return filterQuizQuestions(file, questions, questionEdits, getQuestionId);
}

function buildExamQuestions(
  file: PdfFileQueueItem,
  questions: PdfMcq[],
  questionEdits: Record<string, QuestionEditRecord>,
): ExamQuestion[] {
  return filterValidQuestions(file, questions, questionEdits).map((question, index) => {
    const sourceIndex = questions.indexOf(question);
    const resolvedIndex = sourceIndex >= 0 ? sourceIndex : index;
    const questionId = getQuestionId(file, question, resolvedIndex);
    const edit = questionEdits[questionId];
    const options = getEffectiveOptions(question, edit).slice(0, 4);
    const correctAnswer = getCorrectAnswer(question);
    const correct = options.findIndex((option) =>
      optionMatchesAnswer(option, correctAnswer),
    );

    return {
      id: index + 1,
      text: edit?.questionText?.trim() || getQuestionText(question) || "Question text was not found.",
      options: options.map((option) => option.text),
      correct: correct >= 0 ? correct : 0,
      sourceQuestion: question,
      sourceIndex: resolvedIndex,
    };
  });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function IntroScreen({
  questionCount,
  totalTime,
  subjectTitle,
  onStart,
  onBack,
}: {
  questionCount: number;
  totalTime: number;
  subjectTitle: string;
  onStart: () => void;
  onBack: () => void;
}) {
  return (
    <div
      style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}
      className="min-h-screen w-screen overflow-y-auto bg-slate-100"
    >
      <header className="sticky top-0 z-50 shrink-0 border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4">
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <Image
              alt={APP_NAME}
              className="size-7 rounded-lg object-contain"
              height={28}
              src={APP_LOGO_URL}
              unoptimized
              width={28}
            />
            <span className="truncate font-[family-name:var(--font-sora)] text-sm font-black text-slate-950 sm:text-base">
              DrNote
            </span>
          </div>

          <div className="w-[72px] shrink-0 sm:w-[88px]" aria-hidden />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-5 py-10 md:py-16">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-200">
            <FileText size={20} className="text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight text-slate-800 md:text-3xl">
              Mock Exam
            </h1>
            <p className="mt-0.5 text-sm font-medium text-slate-500">{subjectTitle}</p>
          </div>
        </div>

        <div className="mb-8 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300">
          <div className="flex items-center gap-3 bg-white px-5 py-4">
            <FileText size={18} className="flex-shrink-0 text-slate-400" />
            <span className="text-base font-bold text-slate-800">
              {questionCount} Questions
            </span>
          </div>

          <div className="border-t border-dashed border-slate-200" />

          <div className="bg-white">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <Clock size={18} className="flex-shrink-0 text-slate-400" />
              <span className="text-base font-bold text-slate-800">
                {formatDuration(totalTime)}
              </span>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm leading-relaxed text-slate-500">
                The timer cannot be paused. This exam imitates the real time limit and
                question count of a professional certification exam.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8 space-y-4">
          <p className="text-base font-bold leading-snug text-slate-800 md:text-lg">
            Our mock exam imitates both the time limit and question count of a
            professional certification exam.
          </p>
          <p className="text-sm leading-relaxed text-slate-500 md:text-base">
            Subject matter experts developed this content to prepare you for the types of
            questions you will see on the official examination. Content is based on
            current industry standards and best practices.
          </p>
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <p className="text-sm leading-relaxed text-slate-400">
              Warning: You will NOT see these exact exam questions on exam day.
            </p>
          </div>
        </div>

        <button
          className="w-full rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
          onClick={onStart}
          type="button"
        >
          Start Exam
        </button>
      </div>
    </div>
  );
}

type MockExamPanelProps = {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  onRecordAnswer: (questionId: string, answer: QuestionAnswer) => void;
  returnHref?: string;
};

export function MockExamPanel({
  file,
  questions,
  onRecordAnswer,
  returnHref = "/dashboard",
}: MockExamPanelProps) {
  const router = useRouter();
  const sessionChrome = useStudySessionChromeOptional();
  const [questionEdits, setQuestionEdits] = useState<
    Record<string, QuestionEditRecord>
  >(() => loadQuestionEdits()[file.id] ?? {});
  const [preparingExam, setPreparingExam] = useState(false);
  const [prepFailed, setPrepFailed] = useState(false);
  const [prepRetryKey, setPrepRetryKey] = useState(0);
  const examPrepAttempted = useRef(false);
  const examQuestions = useMemo(
    () => buildExamQuestions(file, questions, questionEdits),
    [file, questionEdits, questions],
  );
  const totalTime = useMemo(
    () => Math.max(2 * 60 * 60, examQuestions.length * 90),
    [examQuestions.length],
  );

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [showPanel, setShowPanel] = useState(false);
  const [panelFilter, setPanelFilter] = useState("all");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const hasShownLastQuestionPrompt = useRef(false);

  const isLastQuestion = currentQ === examQuestions.length - 1;
  const selected = answers[currentQ] ?? null;

  useEffect(() => {
    if (!file?.id || !questions.length || examPrepAttempted.current) return;
    if (examQuestions.length > 0) return;

    const readiness = summarizeQuizReadiness(file, questions, questionEdits, getQuestionId);
    if (readiness.needsPrep === 0) return;

    examPrepAttempted.current = true;
    let cancelled = false;

    async function prepareExamChoices() {
      setPreparingExam(true);
      setPrepFailed(false);

      const nextEdits = { ...questionEdits };
      let changed = false;

      for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
        if (cancelled) return;
        const item = questions[questionIndex]!;
        const itemId = getQuestionId(file, item, questionIndex);
        const itemEdit = nextEdits[itemId];
        if (!questionNeedsChoicePrep(item, itemEdit)) continue;

        const questionText = itemEdit?.questionText ?? getRawQuestionText(item);
        if (!questionText.trim()) continue;

        const rawOptions = ensureFourOptionSlots(getEffectiveOptions(item, itemEdit));
        try {
          const response = await fetch("/api/pdf/fix-grammar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "fill-choices",
              questionText,
              options: rawOptions,
            }),
          });
          const data = (await response.json()) as {
            error?: string;
            questionText?: string;
            options?: Array<{ label: string; text: string }>;
          };
          if (!response.ok) continue;

          const merged = {
            ...itemEdit,
            questionText: data.questionText ?? questionText,
            options: ensureFourOptionSlots(data.options ?? rawOptions),
          };
          nextEdits[itemId] = merged;
          saveQuestionEdit(file.id, itemId, merged);
          changed = true;
        } catch {
          // Keep trying other questions.
        }
      }

      if (cancelled) return;
      if (changed) {
        setQuestionEdits(nextEdits);
      }
      setPrepFailed(!filterValidQuestions(file, questions, nextEdits).length);
      setPreparingExam(false);
    }

    void prepareExamChoices();

    return () => {
      cancelled = true;
    };
  }, [examQuestions.length, file, prepRetryKey, questionEdits, questions]);

  useEffect(() => {
    sessionChrome?.setChrome({ variant: "hidden" });
    return () => sessionChrome?.resetChrome();
  }, [sessionChrome]);

  useEffect(() => {
    if (!started || finished || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft((time) => time - 1), 1000);
    return () => clearInterval(interval);
  }, [started, finished, timeLeft]);

  useEffect(() => {
    if (
      started &&
      !finished &&
      isLastQuestion &&
      !hasShownLastQuestionPrompt.current
    ) {
      hasShownLastQuestionPrompt.current = true;
      setShowEndDialog(true);
    }
  }, [started, finished, isLastQuestion]);

  const finishExam = useCallback(() => {
    setFinished(true);
    setShowEndDialog(false);
    setShowPanel(false);

    const correct = examQuestions.reduce((count, question, index) => {
      return count + (answers[index] === question.correct ? 1 : 0);
    }, 0);
    const finishedAt = Date.now();
    const sessionId = `${file.id}-${finishedAt}`;

    saveQuizSession({
      id: sessionId,
      fileId: file.id,
      fileName: file.name,
      mode: "exam",
      startedAt,
      finishedAt,
      correct,
      total: examQuestions.length,
      durationMs: finishedAt - startedAt,
    });

    router.push(
      `/dashboard/content/analysis?file=${encodeURIComponent(file.id)}&session=${encodeURIComponent(sessionId)}`,
    );
  }, [answers, examQuestions, file.id, file.name, router, startedAt]);

  useEffect(() => {
    if (started && !finished && timeLeft <= 0) {
      const timeout = window.setTimeout(finishExam, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [started, finished, timeLeft, finishExam]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const sec = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const handleSelect = (idx: number) => {
    setAnswers((prev) => ({ ...prev, [currentQ]: idx }));

    const question = examQuestions[currentQ];
    if (!question) return;

    const questionId = getQuestionId(file, question.sourceQuestion, question.sourceIndex);
    onRecordAnswer(questionId, {
      selected: labels[idx] ?? String.fromCharCode(65 + idx),
      isCorrect: idx === question.correct,
    });
  };

  const toggleFlag = () =>
    setFlagged((prev) => ({ ...prev, [currentQ]: !prev[currentQ] }));

  const goTo = (idx: number) => {
    setCurrentQ(idx);
    setShowPanel(false);
  };

  if (preparingExam) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-slate-500">
        Preparing exam choices…
      </div>
    );
  }

  if (!examQuestions.length) {
    const readiness = summarizeQuizReadiness(file, questions, questionEdits, getQuestionId);
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-center text-sm text-slate-500">
        <p className="font-semibold text-slate-700">
          {questions.length
            ? "No exam-ready questions yet."
            : "No questions were extracted from this file."}
        </p>
        {questions.length ? (
          <>
            <p>
              Found {readiness.total} question{readiness.total === 1 ? "" : "s"}, but{" "}
              {readiness.ready} ha{readiness.ready === 1 ? "s" : "ve"} four usable answer choices.
              Mock exam needs complete A–D options for each question.
            </p>
            {prepFailed ? (
              <p className="text-slate-400">
                Automatic choice repair did not finish. Open Review to edit choices manually, or
                re-upload with “Make choices when missing” in quiz settings.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Link
                className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white"
                href={`/dashboard/content/study?file=${encodeURIComponent(file.id)}&mode=review`}
              >
                Open Review
              </Link>
              <button
                className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700"
                onClick={() => {
                  examPrepAttempted.current = false;
                  setPrepFailed(false);
                  setPrepRetryKey((value) => value + 1);
                }}
                type="button"
              >
                Try again
              </button>
            </div>
          </>
        ) : (
          <p>Upload a PDF with multiple-choice questions to start a mock exam.</p>
        )}
      </div>
    );
  }

  if (!started) {
    return (
      <IntroScreen
        onBack={() => router.push(returnHref)}
        onStart={() => setStarted(true)}
        questionCount={examQuestions.length}
        subjectTitle={file.result.title || file.name}
        totalTime={totalTime}
      />
    );
  }

  if (finished) {
    return (
      <div
        style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}
        className="flex min-h-screen w-screen items-center justify-center bg-slate-100 px-4"
      >
        <p className="text-sm font-semibold text-slate-500">Loading your results…</p>
      </div>
    );
  }

  const progress = (Object.keys(answers).length / examQuestions.length) * 100;
  const answeredCount = Object.keys(answers).length;
  const flaggedCount = Object.keys(flagged).filter((key) => flagged[Number(key)]).length;
  const unansweredCount = examQuestions.length - answeredCount;
  const timeWarning = timeLeft < 600;

  const filteredIndices = examQuestions.map((_, index) => index).filter((index) => {
    if (panelFilter === "flagged") return flagged[index];
    if (panelFilter === "unanswered") return answers[index] === undefined;
    if (panelFilter === "answered") return answers[index] !== undefined;
    return true;
  });

  return (
    <div
      style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}
      className="flex h-screen w-screen select-none flex-col overflow-hidden bg-slate-100"
    >
      <header className="z-20 flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:px-6">
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
            <ClipboardList size={15} className="text-white" />
          </div>
          <span className="hidden text-sm font-semibold text-slate-800 sm:block">
            Mock Exam
          </span>
        </div>
        <div className="mx-3 flex-1 md:mx-8">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="hidden text-xs font-medium text-slate-400 sm:block md:text-sm">
            <span className="font-bold text-slate-700">{currentQ + 1}</span>
            <span className="mx-0.5">/</span>
            {examQuestions.length}
          </span>
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <div
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold md:text-sm ${
              timeWarning
                ? "border border-red-200 bg-red-50 text-red-600"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            <Timer
              size={14}
              className={timeWarning ? "text-red-500" : "text-slate-500"}
            />
            {formatTime(timeLeft)}
          </div>
          <button
            className="whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-amber-500 md:px-4 md:text-sm"
            onClick={() => setShowEndDialog(true)}
            type="button"
          >
            End Exam
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-8 md:items-center md:px-6 md:py-12">
        <div className="w-full max-w-2xl">
          <p className="mb-8 text-xl font-bold leading-relaxed text-slate-800 md:mb-10 md:text-2xl">
            {examQuestions[currentQ].text}
          </p>

          <div className="mb-10 space-y-3 md:space-y-4">
            {examQuestions[currentQ].options.map((option, idx) => {
              const isSelected = selected === idx;
              return (
                <button
                  key={idx}
                  className={`group flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-150 md:px-6 md:py-5 ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-transparent bg-white shadow-sm hover:border-slate-200 hover:shadow-md"
                  }`}
                  onClick={() => handleSelect(idx)}
                  type="button"
                >
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                      isSelected
                        ? "bg-blue-500 text-white"
                        : "bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600"
                    }`}
                  >
                    {labels[idx]}
                  </span>
                  <span
                    className={`text-base font-medium leading-snug transition-colors md:text-lg ${
                      isSelected ? "text-blue-800" : "text-slate-700"
                    }`}
                  >
                    {option}
                  </span>
                  {isSelected ? (
                    <CheckCircle2 size={20} className="ml-auto flex-shrink-0 text-blue-500" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex justify-center">
            <button
              className={`rounded-2xl px-12 py-3 text-sm font-bold shadow-sm transition-colors md:px-16 md:py-3.5 md:text-base ${
                isLastQuestion
                  ? "bg-amber-400 text-slate-900 hover:bg-amber-500"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
              onClick={() => {
                if (isLastQuestion) {
                  setShowEndDialog(true);
                } else {
                  setCurrentQ((question) => question + 1);
                }
              }}
              type="button"
            >
              {isLastQuestion ? "End Exam" : "Next Question"}
            </button>
          </div>
        </div>
      </main>

      <nav className="z-20 flex flex-shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-3 md:px-8">
        <button
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
          onClick={() => setShowPanel(true)}
          type="button"
        >
          <List size={18} />
          <span className="hidden sm:inline">All Questions</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentQ === 0}
            onClick={() => setCurrentQ((question) => Math.max(0, question - 1))}
            type="button"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              flagged[currentQ]
                ? "border-amber-300 bg-amber-50 text-amber-500"
                : "border-slate-200 text-slate-500 hover:bg-slate-100"
            }`}
            onClick={toggleFlag}
            type="button"
          >
            <Flag size={16} />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentQ === examQuestions.length - 1}
            onClick={() =>
              setCurrentQ((question) => Math.min(examQuestions.length - 1, question + 1))
            }
            type="button"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="w-20 sm:w-32" />
      </nav>

      {showPanel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setShowPanel(false)}
          />
          <div className="relative mx-0 w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:mx-4 sm:max-w-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-bold text-slate-800">All Questions</h2>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setShowPanel(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex items-end gap-4 overflow-x-auto border-b border-slate-100 px-5 pt-3 pb-0 md:gap-6">
              {[
                { key: "all", label: "All", count: examQuestions.length },
                { key: "flagged", label: "Flagged", count: flaggedCount },
                { key: "unanswered", label: "Unanswered", count: unansweredCount },
                { key: "answered", label: "Answered", count: answeredCount },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`border-b-2 pb-3 text-xs font-semibold whitespace-nowrap transition-colors md:text-sm ${
                    panelFilter === tab.key
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => setPanelFilter(tab.key)}
                  type="button"
                >
                  {tab.label} <span className="font-bold">{tab.count}</span>
                </button>
              ))}
              <div className="ml-auto flex flex-shrink-0 items-center gap-3 pb-3 text-xs text-slate-400">
                <span className="hidden items-center gap-1 md:flex">
                  <Circle size={9} /> Unanswered
                </span>
                <span className="hidden items-center gap-1 md:flex">
                  <CheckCircle2 size={9} className="text-slate-600" /> Answered
                </span>
                <span className="hidden items-center gap-1 md:flex">
                  <Flag size={9} className="text-amber-400" /> Flagged
                </span>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-5">
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                {examQuestions.map((_, index) => {
                  if (!filteredIndices.includes(index)) return null;
                  const isAnswered = answers[index] !== undefined;
                  const isFlagged = flagged[index];
                  const isCurrent = index === currentQ;
                  return (
                    <button
                      key={index}
                      className={`relative flex h-11 items-center justify-between rounded-xl border-2 px-2.5 text-sm font-semibold transition-all ${
                        isCurrent
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : isFlagged
                            ? "border-amber-300 bg-amber-50 text-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                      onClick={() => goTo(index)}
                      type="button"
                    >
                      <span>{index + 1}</span>
                      <span className="flex items-center gap-0.5">
                        {isFlagged ? (
                          <Flag size={9} className="text-amber-400" />
                        ) : null}
                        {isAnswered ? (
                          <CheckCircle2 size={11} className="text-slate-600" />
                        ) : (
                          <Circle size={11} className="text-slate-300" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showEndDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setShowEndDialog(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50">
              <Timer size={22} className="text-amber-500" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-800">End Exam?</h2>
            <p className="mb-1 text-sm text-slate-500">
              You have answered <strong>{answeredCount}</strong> of{" "}
              <strong>{examQuestions.length}</strong> questions.
            </p>
            <p className="mb-6 text-xs text-slate-400">
              Time remaining: {formatTime(timeLeft)}
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-xl border-2 border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => setShowEndDialog(false)}
                type="button"
              >
                Continue
              </button>
              <button
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-500"
                onClick={finishExam}
                type="button"
              >
                End Exam
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
