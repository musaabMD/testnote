"use client";

import { QuestionFeedbackDialog } from "@/components/pdf/question-feedback-dialog";
import { QuestionMedia } from "@/components/pdf/question-media";
import { QuizFloatingTutor } from "@/components/pdf/quiz-floating-tutor";
import { QuizSettingsDrawer } from "@/components/pdf/quiz-settings-drawer";
import {
  canShowQuestionSource,
  getCorrectAnswer,
  getNotes,
  getOptions,
  getQuestionId,
  getQuestionText,
  optionMatchesAnswer,
  type QuestionAnswer,
} from "@/components/pdf/pdf-study-panel";
import { useStudySessionChromeOptional } from "@/components/pdf/study-session-chrome";
import type { PdfFileQueueItem, PdfMcq } from "@/lib/pdf-mcqs";
import {
  loadPdfQuizSettings,
  savePdfQuizSettings,
  type PdfQuizSettings,
} from "@/lib/quiz-settings";
import {
  loadQuestionEdits,
  saveQuestionEdit,
  type QuestionEditRecord,
} from "@/lib/question-edits";
import { saveQuizSession } from "@/lib/quiz-sessions";
import {
  buildChoiceExplanations,
  getShortQuizFeedback,
  hasUsableExplanationNotes,
} from "@/lib/quiz-tutor-prompt";
import {
  ensureFourOptionSlots,
  filterQuizQuestions,
  getEffectiveOptions,
  questionNeedsChoicePrep,
  summarizeQuizReadiness,
} from "@/lib/quiz-questions";
import {
  cleanExplanationText,
  getRawQuestionText,
  getDisplayOptionLabel,
  hasFormattedQuestionVariant,
  hasGrammarProblems,
  isPlaceholderOptionText,
  isRtlContent,
} from "@/lib/question-text";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  RotateCcw,
  ScanSearch,
  Settings2,
  SpellCheck,
  ThumbsDown,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function getRawOptions(question: PdfMcq) {
  return (
    question.options ??
    question.choices?.map((choice, index) => ({
      label: String.fromCharCode(65 + index),
      text: choice,
    })) ??
    []
  ).map((option) => ({
    label: option.label,
    text: option.text.trim(),
  }));
}

function filterValidQuestions(
  file: PdfFileQueueItem,
  questions: PdfMcq[],
  questionEdits: Record<string, QuestionEditRecord>,
) {
  return filterQuizQuestions(file, questions, questionEdits, getQuestionId);
}

function resolveQuestionIndex(questions: PdfMcq[], question: PdfMcq) {
  const direct = questions.indexOf(question);
  if (direct >= 0) return direct;
  const text = getQuestionText(question);
  return questions.findIndex((item) => getQuestionText(item) === text);
}

function countCorrectAnswers(
  file: PdfFileQueueItem,
  allQuestions: PdfMcq[],
  validQuestions: PdfMcq[],
  questionAnswers: Record<string, QuestionAnswer>,
) {
  return validQuestions.reduce((count, item) => {
    const idx = resolveQuestionIndex(allQuestions, item);
    const id = getQuestionId(file, item, idx);
    return count + (questionAnswers[id]?.isCorrect ? 1 : 0);
  }, 0);
}

export function QuizModePanel({
  file,
  questions,
  examMode,
  bookmarkedQuestionIds,
  questionAnswers,
  onToggleBookmark,
  onRecordAnswer,
  onShowQuestionSource,
}: {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  examMode: boolean;
  bookmarkedQuestionIds: Set<string>;
  questionAnswers: Record<string, QuestionAnswer>;
  onToggleBookmark: (questionId: string) => void;
  onRecordAnswer: (questionId: string, answer: QuestionAnswer) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
}) {
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PdfQuizSettings>(loadPdfQuizSettings);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [submitPromptOpen, setSubmitPromptOpen] = useState(false);
  const [showOriginalQuestionId, setShowOriginalQuestionId] = useState<string | null>(null);
  const [pendingSelectionState, setPendingSelectionState] = useState<{
    questionId: string;
    label: string;
  } | null>(null);
  const [questionEdits, setQuestionEdits] = useState<
    Record<string, QuestionEditRecord>
  >(() => loadQuestionEdits()[file.id] ?? {});
  const [fixingGrammar, setFixingGrammar] = useState(false);
  const [fillingChoices, setFillingChoices] = useState(false);
  const [preparingQuiz, setPreparingQuiz] = useState(false);
  const [prepFailed, setPrepFailed] = useState(false);
  const [prepRetryKey, setPrepRetryKey] = useState(0);
  const [completedDurationMs, setCompletedDurationMs] = useState<number | null>(null);
  const autoGrammarAttempted = useRef(new Set<string>());
  const autoFillAttempted = useRef(new Set<string>());
  const quizPrepAttempted = useRef(false);
  const [startedAt] = useState(() => Date.now());
  const sessionChrome = useStudySessionChromeOptional();

  const validQuestions = useMemo(
    () => filterValidQuestions(file, questions, questionEdits),
    [file, questionEdits, questions],
  );

  const question = validQuestions[index];
  const displayIndex = question ? resolveQuestionIndex(questions, question) : index;
  const questionId = question ? getQuestionId(file, question, displayIndex) : "";
  const edit = questionId ? questionEdits[questionId] : undefined;
  const pendingSelection =
    pendingSelectionState?.questionId === questionId
      ? pendingSelectionState.label
      : null;
  const showOriginal = showOriginalQuestionId === questionId;
  const optionsForLayout = question ? edit?.options ?? getOptions(question) : [];
  const isRtl = question
    ? isRtlContent(
        [
          edit?.questionText ?? getQuestionText(question),
          ...optionsForLayout.map((option) => option.text),
        ].join(" "),
      )
    : false;
  const textDirection = isRtl ? "rtl" : "ltr";
  const answerState = questionId ? questionAnswers[questionId] : undefined;
  const isBookmarked = questionId ? bookmarkedQuestionIds.has(questionId) : false;
  const isLastQuestion = index >= validQuestions.length - 1;
  const showFeedback =
    settings.showAnswers === "asIGo" && Boolean(answerState);
  const canViewSource = Boolean(
    question && onShowQuestionSource && canShowQuestionSource(question, file.source),
  );
  const options = question ? edit?.options ?? getOptions(question) : [];
  const correctAnswer = question ? getCorrectAnswer(question) : "";

  async function applyGrammarFix() {
    if (fixingGrammar || !question || !questionId) return false;
    setFixingGrammar(true);

    const questionText = edit?.questionText ?? getRawQuestionText(question);
    const rawOptions = edit?.options ?? getRawOptions(question);

    try {
      const response = await fetch("/api/pdf/fix-grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText,
          options: rawOptions,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        questionText?: string;
        options?: Array<{ label: string; text: string }>;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not fix grammar.");
      }

      const merged = {
        ...edit,
        questionText: data.questionText ?? questionText,
        options: data.options ?? rawOptions,
      };
      setQuestionEdits((current) => ({ ...current, [questionId]: merged }));
      saveQuestionEdit(file.id, questionId, merged);
      setShowOriginalQuestionId(null);
      return true;
    } catch {
      return false;
    } finally {
      setFixingGrammar(false);
    }
  }

  async function applyFillChoices() {
    if (fillingChoices || !question || !questionId) return false;
    setFillingChoices(true);

    const questionText = edit?.questionText ?? getRawQuestionText(question);
    const rawOptions = ensureFourOptionSlots(edit?.options ?? getRawOptions(question));
    const needsFill =
      rawOptions.length < 4 ||
      rawOptions.some((option) => isPlaceholderOptionText(option.text));
    if (!needsFill) {
      setFillingChoices(false);
      return false;
    }

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
      if (!response.ok) {
        throw new Error(data.error ?? "Could not fill missing choices.");
      }

      const merged = {
        ...edit,
        questionText: data.questionText ?? questionText,
        options: data.options ?? rawOptions,
      };
      setQuestionEdits((current) => ({ ...current, [questionId]: merged }));
      saveQuestionEdit(file.id, questionId, merged);
      return true;
    } catch {
      return false;
    } finally {
      setFillingChoices(false);
    }
  }

  const applyGrammarFixRef = useRef(applyGrammarFix);
  const applyFillChoicesRef = useRef(applyFillChoices);

  useEffect(() => {
    applyGrammarFixRef.current = applyGrammarFix;
    applyFillChoicesRef.current = applyFillChoices;
  });

  useEffect(() => {
    if (!question || !questionId || fixingGrammar) return;

    const grammarText = edit?.questionText ?? getRawQuestionText(question);
    const grammarOptions = edit?.options ?? getRawOptions(question);
    if (isRtlContent([grammarText, ...grammarOptions.map((option) => option.text)].join(" "))) {
      return;
    }
    const needsFix =
      hasGrammarProblems(grammarText) ||
      grammarOptions.some((option) => hasGrammarProblems(option.text));

    if (!needsFix || autoGrammarAttempted.current.has(questionId)) return;

    autoGrammarAttempted.current.add(questionId);
    const timeout = window.setTimeout(() => {
      void applyGrammarFixRef.current();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [edit, fixingGrammar, question, questionId]);

  useEffect(() => {
    if (!question || !questionId || fillingChoices) return;

    const rawOptions = ensureFourOptionSlots(edit?.options ?? getRawOptions(question));
    const needsFill =
      rawOptions.length < 4 ||
      rawOptions.some((option) => isPlaceholderOptionText(option.text));
    if (!needsFill || autoFillAttempted.current.has(questionId)) return;

    autoFillAttempted.current.add(questionId);
    const timeout = window.setTimeout(() => {
      void applyFillChoicesRef.current();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [edit, fillingChoices, question, questionId]);

  useEffect(() => {
    if (!file?.id || !questions.length || quizPrepAttempted.current) return;
    if (validQuestions.length > 0) return;

    const readiness = summarizeQuizReadiness(file, questions, questionEdits, getQuestionId);
    if (readiness.needsPrep === 0) return;

    quizPrepAttempted.current = true;
    let cancelled = false;

    async function prepareQuizChoices() {
      setPreparingQuiz(true);
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
      setPreparingQuiz(false);
    }

    void prepareQuizChoices();

    return () => {
      cancelled = true;
    };
  }, [file, prepRetryKey, questionEdits, questions, validQuestions.length]);

  const goNext = useCallback(() => {
    if (isLastQuestion) {
      setSubmitPromptOpen(true);
      return;
    }
    setIndex((value) => value + 1);
  }, [isLastQuestion]);

  const goPrev = useCallback(() => {
    setIndex((value) => Math.max(0, value - 1));
  }, []);

  function selectOption(option: { label: string; text: string }) {
    if (answerState || !questionId) return;
    if (settings.submitMode === "manual") {
      setPendingSelectionState({ questionId, label: option.label });
      return;
    }
    onRecordAnswer(questionId, {
      selected: option.label,
      isCorrect: optionMatchesAnswer(option, correctAnswer),
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (finished || submitPromptOpen || settingsOpen || feedbackOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if (event.key === "ArrowRight" || event.key === ">") {
        event.preventDefault();
        if (answerState || settings.submitMode === "manual") goNext();
      }
      if (event.key === "ArrowLeft" || event.key === "<") {
        event.preventDefault();
        goPrev();
      }
      if (/^[a-d1-4]$/i.test(event.key) && question && !answerState) {
        const options = getOptions(question);
        const pick =
          event.key >= "1" && event.key <= "4"
            ? options[Number(event.key) - 1]
            : options[event.key.toUpperCase().charCodeAt(0) - 65];
        if (pick) selectOption(pick);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!sessionChrome || finished || !question) {
      sessionChrome?.resetChrome();
      return;
    }

    sessionChrome.setChrome({
      variant: "default",
      center: (
        <div className="flex items-center gap-2">
          <span className="min-w-[3.5rem] text-center text-sm font-bold text-slate-500">
            {index + 1} / {validQuestions.length}
          </span>
          <button
            className={`grid size-9 place-items-center rounded-full transition ${
              isBookmarked ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
            onClick={() => onToggleBookmark(questionId)}
            type="button"
            aria-label="Bookmark question"
          >
            <Flag className="size-4" fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          {canViewSource ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                    onClick={() => onShowQuestionSource?.(question)}
                    type="button"
                    aria-label="View source"
                  />
                }
              >
                <ScanSearch className="size-4" />
              </TooltipTrigger>
              <TooltipContent>
                {isRtl
                  ? "يعرض موقع هذا السؤال في ملف PDF المصدر."
                  : "Highlights this question's exact location in the source PDF."}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {!isRtl ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
                    disabled={fixingGrammar}
                    onClick={() => void applyGrammarFixRef.current()}
                    type="button"
                    aria-label={fixingGrammar ? "Fixing grammar" : "Fix grammar"}
                  />
                }
              >
                <SpellCheck className="size-4" />
              </TooltipTrigger>
              <TooltipContent>
                Fixes OCR typos and grammar without changing question meaning.
              </TooltipContent>
            </Tooltip>
          ) : null}
          <button
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            onClick={() => setFeedbackOpen(true)}
            type="button"
            aria-label="Report issue"
          >
            <ThumbsDown className="size-4" />
          </button>
        </div>
      ),
      right: (
        <div className="flex items-center gap-1.5">
          <button
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            onClick={() => setSettingsOpen(true)}
            type="button"
            aria-label="Quiz settings"
          >
            <Settings2 className="size-4" />
          </button>
          <button
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"
            disabled={index === 0}
            onClick={goPrev}
            type="button"
            aria-label="Previous question"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            className="grid size-9 place-items-center rounded-full bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-30"
            disabled={settings.submitMode === "auto" ? !answerState : !answerState && !pendingSelection}
            onClick={goNext}
            type="button"
            aria-label={isLastQuestion ? "Submit quiz" : "Next question"}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      ),
    });

    return () => sessionChrome.resetChrome();
  }, [
    answerState,
    canViewSource,
    feedbackOpen,
    finished,
    fixingGrammar,
    goNext,
    goPrev,
    index,
    isBookmarked,
    isLastQuestion,
    isRtl,
    onShowQuestionSource,
    onToggleBookmark,
    pendingSelection,
    question,
    questionId,
    sessionChrome,
    settings.submitMode,
    settingsOpen,
    submitPromptOpen,
    validQuestions.length,
  ]);

  if (preparingQuiz) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-slate-500">
        Preparing quiz choices…
      </div>
    );
  }

  if (!validQuestions.length) {
    const readiness = summarizeQuizReadiness(file, questions, questionEdits, getQuestionId);
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-center text-sm text-slate-500">
        <p className="font-semibold text-slate-700">
          {questions.length
            ? "No quiz-ready questions yet."
            : "No questions were extracted from this file."}
        </p>
        {questions.length ? (
          <>
            <p>
              Found {readiness.total} question{readiness.total === 1 ? "" : "s"}, but{" "}
              {readiness.ready} ha{readiness.ready === 1 ? "s" : "ve"} four usable answer choices.
              Quiz mode needs complete A–D options for each question.
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
                  quizPrepAttempted.current = false;
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
          <p>Upload a PDF with multiple-choice questions to start a quiz.</p>
        )}
      </div>
    );
  }

  if (finished) {
    const correct = countCorrectAnswers(file, questions, validQuestions, questionAnswers);
    const total = validQuestions.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    return (
      <div className="mx-auto flex max-w-3xl flex-col px-4 py-12">
        <div className="text-center">
          <h2 className="text-4xl font-black text-slate-950">
            {correct}/{total}
          </h2>
          <p className="mt-2 text-lg font-semibold text-slate-500">{pct}% correct</p>
          <p className="mt-2 text-sm text-slate-500">
            {examMode ? "Exam" : "Quiz"} completed in{" "}
            {Math.round(((completedDurationMs ?? 0) / 1000))}s
          </p>
        </div>

        {settings.showAnswers === "atEnd" ? (
          <ul className="mt-8 space-y-4">
            {validQuestions.map((item, validIndex) => {
              const idx = resolveQuestionIndex(questions, item);
              const id = getQuestionId(file, item, idx);
              const answer = questionAnswers[id];
              const itemEdit = questionEdits[id];
              const itemOptions = itemEdit?.options ?? getOptions(item);
              const correctAnswer = getCorrectAnswer(item);
              const notes = getNotes(item).map(cleanExplanationText).filter(Boolean);
              const breakdown = buildChoiceExplanations(itemOptions, correctAnswer, notes);
              const showItemBreakdown = hasUsableExplanationNotes(notes);

              return (
                <li
                  key={id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Question {validIndex + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {itemEdit?.questionText ?? getQuestionText(item)}
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-700">
                    Your answer: {answer?.selected ?? "—"}{" "}
                    <span className={answer?.isCorrect ? "text-green-600" : "text-red-500"}>
                      {answer?.isCorrect ? "Correct" : "Incorrect"}
                    </span>
                  </p>
                  {correctAnswer ? (
                    <p className="mt-1 text-sm text-slate-600">
                      Best answer: {correctAnswer}
                    </p>
                  ) : null}
                  {showItemBreakdown ? (
                    <ul className="mt-3 space-y-1.5">
                      {breakdown.map((choice) => (
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
        ) : null}

        <div className="mt-8 grid w-full max-w-xs gap-3 self-center">
          <button
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-zinc-950 text-base font-bold text-white"
            onClick={() => {
              setFinished(false);
              setIndex(0);
            }}
            type="button"
          >
            <RotateCcw className="size-5" />
            Try again
          </button>
          <Link
            className="flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-base font-bold text-slate-700"
            href="/dashboard"
          >
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  const notes = getNotes(question).map(cleanExplanationText).filter(Boolean);
  const choiceBreakdown = buildChoiceExplanations(options, correctAnswer, notes);
  const showChoiceBreakdown = hasUsableExplanationNotes(notes);
  const shortFeedback = answerState
    ? getShortQuizFeedback(
        options,
        correctAnswer,
        notes,
        answerState.isCorrect,
        answerState.selected,
      )
    : "";
  const hasOriginalVariant = hasFormattedQuestionVariant(question, edit);
  const displayQuestionText = showOriginal
    ? getRawQuestionText(question)
    : edit?.questionText ?? getQuestionText(question);

  function updateEdit(next: QuestionEditRecord) {
    if (!questionId) return;
    const merged = { ...edit, ...next };
    setQuestionEdits((current) => ({ ...current, [questionId]: merged }));
    saveQuestionEdit(file.id, questionId, merged);
  }

  function finishQuiz() {
    const correct = countCorrectAnswers(file, questions, validQuestions, questionAnswers);
    const finishedAt = Date.now();
    saveQuizSession({
      id: `${file.id}-${finishedAt}`,
      fileId: file.id,
      fileName: file.name,
      mode: examMode ? "exam" : "quiz",
      startedAt,
      finishedAt,
      correct,
      total: validQuestions.length,
      durationMs: finishedAt - startedAt,
    });
    setCompletedDurationMs(finishedAt - startedAt);
    setSubmitPromptOpen(false);
    setFinished(true);
  }

  return (
    <>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 lg:px-6">
        <div className="min-w-0">
          {hasOriginalVariant ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <button
                className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700"
                onClick={() =>
                  setShowOriginalQuestionId((current) =>
                    current === questionId ? null : questionId,
                  )
                }
                type="button"
              >
                {showOriginal ? "Show formatted" : "Show original text"}
              </button>
              {settings.submitMode === "manual" && !answerState && pendingSelection ? (
                <button
                  className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white"
                  onClick={() => {
                    const option = options.find((item) => item.label === pendingSelection);
                    if (!option) return;
                    onRecordAnswer(questionId, {
                      selected: option.label,
                      isCorrect: optionMatchesAnswer(option, correctAnswer),
                    });
                    setPendingSelectionState(null);
                  }}
                  type="button"
                >
                  Check answer
                </button>
              ) : null}
            </div>
          ) : settings.submitMode === "manual" && !answerState && pendingSelection ? (
            <div className="mb-4 flex justify-end">
              <button
                className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white"
                onClick={() => {
                  const option = options.find((item) => item.label === pendingSelection);
                  if (!option) return;
                  onRecordAnswer(questionId, {
                    selected: option.label,
                    isCorrect: optionMatchesAnswer(option, correctAnswer),
                  });
                  setPendingSelectionState(null);
                }}
                type="button"
              >
                Check answer
              </button>
            </div>
          ) : null}

          <h3
            className={`text-xl font-semibold leading-8 text-slate-950 sm:text-2xl rounded-2xl ${
              isRtl ? "text-right" : "text-left"
            }`}
            dir={textDirection}
          >
            {settings.allowEdit && !showOriginal ? (
              <textarea
                className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xl font-semibold leading-8 outline-none focus:border-slate-400"
                onChange={(event) => updateEdit({ questionText: event.target.value })}
                rows={3}
                value={displayQuestionText}
              />
            ) : (
              displayQuestionText || "Question text was not found."
            )}
          </h3>

          <QuestionMedia file={file} question={question} questionIndex={displayIndex} />

          <div className="mt-8 grid gap-3 rounded-2xl" dir={textDirection}>
            {options.map((option, optionIndex) => {
              const picked =
                answerState?.selected === option.label ||
                pendingSelection === option.label;
              const isCorrectOption = optionMatchesAnswer(option, correctAnswer);
              let cls =
                "w-full rounded-2xl border-2 px-5 py-4 text-base font-medium transition ";
              cls += isRtl ? "text-right " : "text-left ";

              if (!answerState && !showFeedback) {
                cls += picked
                  ? "border-zinc-950 bg-slate-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300";
              } else if (picked && answerState?.isCorrect) {
                cls += "border-green-400 bg-green-50 text-green-900";
              } else if (picked && answerState && !answerState.isCorrect) {
                cls += "border-red-400 bg-red-50 text-red-900";
              } else if (isCorrectOption) {
                cls += "border-green-300 bg-green-50/70 text-green-900";
              } else {
                cls += "border-slate-100 bg-slate-50 text-slate-400";
              }

              return (
                <div key={`${option.label}-${option.text}`} className={cls}>
                  <span
                    className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}
                  >
                    <button
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold"
                      disabled={Boolean(answerState)}
                      onClick={() => selectOption(option)}
                      type="button"
                    >
                      {getDisplayOptionLabel(option.label, optionIndex, isRtl)}
                    </button>
                    {settings.allowEdit && !showOriginal ? (
                      <input
                        className={`min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-base font-medium outline-none focus:border-slate-300 ${
                          isRtl ? "text-right" : "text-left"
                        }`}
                        onChange={(event) => {
                          const nextOptions = options.map((item) =>
                            item.label === option.label
                              ? { ...item, text: event.target.value }
                              : item,
                          );
                          updateEdit({ options: nextOptions });
                        }}
                        value={option.text}
                      />
                    ) : (
                      <button
                        className={`flex-1 ${isRtl ? "text-right" : "text-left"}`}
                        disabled={Boolean(answerState)}
                        onClick={() => selectOption(option)}
                        type="button"
                      >
                        {option.text}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {showFeedback && answerState ? (
            <div
              className={`mt-5 rounded-3xl p-5 ${
                answerState.isCorrect ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${
                    answerState.isCorrect ? "bg-green-500" : "bg-red-500"
                  }`}
                >
                  {answerState.isCorrect ? (
                    <Check className="size-5" />
                  ) : (
                    <X className="size-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-base font-black ${
                      answerState.isCorrect ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {answerState.isCorrect ? "Correct!" : "Incorrect"}
                  </p>
                  {!answerState.isCorrect && correctAnswer ? (
                    <p className="mt-0.5 text-sm font-semibold text-red-600">
                      Correct answer: {correctAnswer}
                    </p>
                  ) : null}
                  {shortFeedback ? (
                    <p className="mt-2 text-sm leading-6 text-slate-700">{shortFeedback}</p>
                  ) : null}
                  {showChoiceBreakdown ? (
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {choiceBreakdown.map((choice) => (
                        <li key={choice.label}>
                          <span className="font-semibold">
                            {choice.isCorrect ? "✓" : "✗"} {choice.label}. {choice.text}
                          </span>
                          {choice.reason ? (
                            <span className="block ps-5 text-slate-600">→ {choice.reason}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : !answerState.isCorrect && !shortFeedback ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Open the tutor bubble for a full explanation of each choice.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {questionId && !finished && !submitPromptOpen && !settingsOpen && !feedbackOpen ? (
        <QuizFloatingTutor key={questionId} question={question} />
      ) : null}

      {settingsOpen ? (
        <QuizSettingsDrawer
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            setSettings(next);
            savePdfQuizSettings(next);
          }}
          settings={settings}
        />
      ) : null}

      {feedbackOpen ? (
        <QuestionFeedbackDialog
          fileId={file.id}
          onClose={() => setFeedbackOpen(false)}
          questionId={questionId}
          questionText={getQuestionText(question)}
        />
      ) : null}

      {submitPromptOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black text-slate-950">Submit quiz?</h2>
            <p className="mt-2 text-sm text-slate-500">
              You&apos;ve reached the last question. Submit to see your results.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                className="h-12 rounded-2xl bg-zinc-950 text-sm font-bold text-white"
                onClick={finishQuiz}
                type="button"
              >
                Yes, submit
              </button>
              <button
                className="h-12 rounded-2xl bg-slate-100 text-sm font-bold text-slate-700"
                onClick={() => setSubmitPromptOpen(false)}
                type="button"
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
