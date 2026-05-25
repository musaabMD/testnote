"use client";

import {
  ArrowLeft,
  ArrowUp,
  BarChart3,
  BookMarked,
  Bookmark,
  Check,
  CheckCircle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Flag,
  FolderPlus,
  History,
  Layers,
  Library,
  List,
  MessageSquare,
  MessageSquareText,
  Play,
  RotateCcw,
  ScanSearch,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { PdfFileQueueItem, PdfMcq, PdfSource } from "@/lib/pdf-mcqs";
import { getSourcePreview, isImagePreviewMime, isPdfPreviewMime } from "@/lib/highlightable-source";
import { isImageSource, getFileSubject, loadFileSubjects } from "@/lib/pdf-view-storage";
import { formatOptionText, formatQuestionText, normalizeAnswerLabel } from "@/lib/question-text";
import { useStudySessionChromeOptional } from "@/components/pdf/study-session-chrome";
import { QuestionMedia } from "@/components/pdf/question-media";
import { MockExamPanel } from "@/components/pdf/mock-exam";
import { QuizModePanel } from "@/components/pdf/quiz-mode-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveQuizSession } from "@/lib/quiz-sessions";
import { buildFileAskInstructions } from "@/lib/quiz-tutor-prompt";
import { convex } from "@/lib/convex-client";
import {
  formatRagContext,
  getLocalRagRetrieval,
  type RagRetrievalResult,
  type RagSourceChunk,
} from "@/lib/source-rag";
import { streamTutorReply } from "@/lib/tutor-chat-client";
import { api } from "../../../convex/_generated/api";

export type StudyMode =
  | "flashcards"
  | "quiz"
  | "review"
  | "exam"
  | "summary"
  | "ask";

export const STUDY_MODE_TABS: Array<{
  id: StudyMode;
  label: string;
  icon: typeof Layers;
  color: string;
  bg: string;
  iconColor: string;
  border: string;
}> = [
  {
    id: "flashcards",
    label: "Flashcards",
    icon: Layers,
    color: "bg-violet-100 text-violet-600",
    bg: "#F4F3FE",
    iconColor: "#7F77DD",
    border: "#E0DDFB",
  },
  {
    id: "quiz",
    label: "Quiz",
    icon: CheckSquare,
    color: "bg-indigo-100 text-indigo-600",
    bg: "#F0F7FF",
    iconColor: "#378ADD",
    border: "#C8DFFA",
  },
  {
    id: "review",
    label: "Review",
    icon: BookMarked,
    color: "bg-emerald-100 text-emerald-600",
    bg: "#EDFAF4",
    iconColor: "#1D9E75",
    border: "#B8EDD8",
  },
  {
    id: "exam",
    label: "Exam",
    icon: Clock,
    color: "bg-amber-100 text-amber-600",
    bg: "#FFFBF0",
    iconColor: "#BA7517",
    border: "#FAE4AA",
  },
  {
    id: "summary",
    label: "Summary",
    icon: Sparkles,
    color: "bg-sky-100 text-sky-600",
    bg: "#F0FAFB",
    iconColor: "#0F6E56",
    border: "#B2E8DE",
  },
  {
    id: "ask",
    label: "Ask",
    icon: MessageSquare,
    color: "bg-pink-100 text-pink-600",
    bg: "#FFF0F4",
    iconColor: "#D4537E",
    border: "#F9C4D4",
  },
];

export type FileToolMode = "download" | "library" | "add-subject" | "analysis" | "sessions";

export const FILE_TOOL_TABS: Array<{
  id: FileToolMode;
  label: string;
  icon: typeof Download;
  bg: string;
  iconColor: string;
  border: string;
}> = [
  {
    id: "download",
    label: "Download",
    icon: Download,
    bg: "#FFF4ED",
    iconColor: "#E07A2F",
    border: "#FAD4B8",
  },
  {
    id: "library",
    label: "Library",
    icon: Library,
    bg: "#F4F3FE",
    iconColor: "#7F77DD",
    border: "#E0DDFB",
  },
  {
    id: "add-subject",
    label: "Add Subject",
    icon: FolderPlus,
    bg: "#F0FAFB",
    iconColor: "#0F6E56",
    border: "#B2E8DE",
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: BarChart3,
    bg: "#F0F7FF",
    iconColor: "#378ADD",
    border: "#C8DFFA",
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: History,
    bg: "#F5F3FF",
    iconColor: "#7C3AED",
    border: "#DDD6FE",
  },
];

export type QuestionAnswer = {
  selected: string;
  isCorrect: boolean;
};

export function studyModeHref(fileId: string, mode: StudyMode) {
  return `/dashboard/content/study?file=${encodeURIComponent(fileId)}&mode=${mode}`;
}

export function fileToolHref(fileId: string, tool: FileToolMode) {
  return `/dashboard/content/${tool}?file=${encodeURIComponent(fileId)}`;
}

export function StudyModePicker({
  fileId,
  preview = false,
}: {
  fileId: string;
  preview?: boolean;
}) {
  const allTabs = [
    {
      id: "flashcards" as const,
      label: "Flashcards",
      icon: Layers,
      bg: "bg-violet-50",
      border: "border-violet-200",
      text: "text-violet-700",
      iconBg: "bg-violet-100",
      href: studyModeHref(fileId, "flashcards"),
    },
    {
      id: "quiz" as const,
      label: "Quiz",
      icon: CheckSquare,
      bg: "bg-sky-50",
      border: "border-sky-200",
      text: "text-sky-700",
      iconBg: "bg-sky-100",
      href: studyModeHref(fileId, "quiz"),
    },
    {
      id: "review" as const,
      label: "Review",
      icon: BookMarked,
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      iconBg: "bg-emerald-100",
      href: studyModeHref(fileId, "review"),
    },
    {
      id: "exam" as const,
      label: "Exam",
      icon: Clock,
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-700",
      iconBg: "bg-amber-100",
      href: studyModeHref(fileId, "exam"),
    },
    {
      id: "summary" as const,
      label: "Summary",
      icon: Sparkles,
      bg: "bg-teal-50",
      border: "border-teal-200",
      text: "text-teal-700",
      iconBg: "bg-teal-100",
      href: studyModeHref(fileId, "summary"),
    },
    {
      id: "ask" as const,
      label: "Ask",
      icon: MessageSquare,
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-700",
      iconBg: "bg-rose-100",
      href: studyModeHref(fileId, "ask"),
    },
    {
      id: "download" as const,
      label: "Download",
      icon: Download,
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-700",
      iconBg: "bg-orange-100",
      href: fileToolHref(fileId, "download"),
    },
    {
      id: "library" as const,
      label: "Library",
      icon: Library,
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      text: "text-indigo-700",
      iconBg: "bg-indigo-100",
      href: fileToolHref(fileId, "library"),
    },
    {
      id: "sessions" as const,
      label: "Sessions",
      icon: History,
      bg: "bg-purple-50",
      border: "border-purple-200",
      text: "text-purple-700",
      iconBg: "bg-purple-100",
      href: fileToolHref(fileId, "sessions"),
    },
    {
      id: "analysis" as const,
      label: "Analysis",
      icon: BarChart3,
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-700",
      iconBg: "bg-blue-100",
      href: fileToolHref(fileId, "analysis"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 md:grid-cols-5">
      {allTabs.map((tab) => {
        const Icon = tab.icon;
        const className = preview
          ? "flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 bg-gray-50 px-2 py-3 text-xs font-semibold text-gray-400 opacity-70"
          : `flex flex-col items-center gap-2 rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-all hover:brightness-95 ${tab.bg} ${tab.border} ${tab.text}`;
        const iconWrapClass = preview
          ? "flex size-8 items-center justify-center rounded-lg bg-gray-100 text-gray-400"
          : `flex size-8 items-center justify-center rounded-lg ${tab.iconBg}`;

        if (preview) {
          return (
            <div key={tab.id} aria-hidden className={className}>
              <div className={iconWrapClass}>
                <Icon className="size-4" aria-hidden />
              </div>
              {tab.label}
            </div>
          );
        }

        return (
          <Link key={tab.id} className={className} href={tab.href}>
            <div className={iconWrapClass}>
              <Icon className="size-4" aria-hidden />
            </div>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

type PdfStudyPanelProps = {
  file: PdfFileQueueItem;
  mode: StudyMode;
  onModeChange: (mode: StudyMode) => void;
  bookmarkedQuestionIds: Set<string>;
  questionAnswers: Record<string, QuestionAnswer>;
  onToggleBookmark: (questionId: string) => void;
  onRecordAnswer: (questionId: string, answer: QuestionAnswer) => void;
  onExplain?: (question: PdfMcq) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
  layout?: "embedded" | "full";
};

export function PdfStudyPanel({
  file,
  mode,
  onModeChange,
  bookmarkedQuestionIds,
  questionAnswers,
  onToggleBookmark,
  onRecordAnswer,
  onExplain = () => {},
  onShowQuestionSource,
  layout = "embedded",
}: PdfStudyPanelProps) {
  const questions = file.result.mcqs;
  const isFull = layout === "full";

  if (isFull) {
    const isAsk = mode === "ask";

    return (
      <div
        className={`flex flex-1 flex-col ${
          "bg-white"
        } ${
          isAsk ? "min-h-[calc(100vh-0px)]" : "min-h-[calc(100vh-3.5rem)]"
        }`}
      >
        {mode === "exam" ? (
          <MockExamPanel
            key={file.id}
            file={file}
            onRecordAnswer={onRecordAnswer}
            questions={questions}
          />
        ) : mode === "quiz" ? (
          <QuizModePanel
            key={file.id}
            bookmarkedQuestionIds={bookmarkedQuestionIds}
            examMode={false}
            file={file}
            onRecordAnswer={onRecordAnswer}
            onShowQuestionSource={onShowQuestionSource}
            onToggleBookmark={onToggleBookmark}
            questionAnswers={questionAnswers}
            questions={questions}
          />
        ) : mode === "review" ? (
          <InlineReviewMode
            bookmarkedQuestionIds={bookmarkedQuestionIds}
            file={file}
            fullPage
            onExplain={onExplain}
            onShowQuestionSource={onShowQuestionSource}
            onToggleBookmark={onToggleBookmark}
            questionAnswers={questionAnswers}
            questions={questions}
          />
        ) : mode === "flashcards" ? (
          <FlashcardsInline
            file={file}
            fullPage
            onExplain={onExplain}
            onShowQuestionSource={onShowQuestionSource}
            questions={questions}
          />
        ) : mode === "summary" ? (
          <SummaryInline
            bookmarkedQuestionIds={bookmarkedQuestionIds}
            file={file}
            fullPage
            onShowQuestionSource={onShowQuestionSource}
            onToggleBookmark={onToggleBookmark}
            questions={questions}
          />
        ) : (
          <AskInline
            file={file}
            fullPage
            onShowQuestionSource={onShowQuestionSource}
            questions={questions}
          />
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <div className="overflow-x-auto px-3 pt-3">
        <div className="flex min-w-max gap-2 pb-3">
          {STUDY_MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${
                mode === tab.id
                  ? "bg-zinc-950 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => onModeChange(tab.id)}
              type="button"
            >
              <tab.icon className="size-3.5 shrink-0 sm:size-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-2">
        <h2 className="truncate text-lg font-black text-slate-950 sm:text-xl">
          {file.name}
        </h2>
        <p className="mt-0.5 text-sm font-medium text-slate-400">
          {questions.length} question{questions.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="p-4 sm:p-5">
        {mode === "quiz" || mode === "exam" ? (
          <InlineQuizMode
            bookmarkedQuestionIds={bookmarkedQuestionIds}
            file={file}
            onExplain={onExplain}
            onRecordAnswer={onRecordAnswer}
            onShowQuestionSource={onShowQuestionSource}
            onToggleBookmark={onToggleBookmark}
            questionAnswers={questionAnswers}
            questions={questions}
          />
        ) : mode === "review" ? (
          <InlineReviewMode
            bookmarkedQuestionIds={bookmarkedQuestionIds}
            file={file}
            onExplain={onExplain}
            onShowQuestionSource={onShowQuestionSource}
            onToggleBookmark={onToggleBookmark}
            questionAnswers={questionAnswers}
            questions={questions}
          />
        ) : mode === "flashcards" ? (
          <FlashcardsInline
            file={file}
            onExplain={onExplain}
            onShowQuestionSource={onShowQuestionSource}
            questions={questions}
          />
        ) : mode === "summary" ? (
          <SummaryInline
            bookmarkedQuestionIds={bookmarkedQuestionIds}
            file={file}
            onShowQuestionSource={onShowQuestionSource}
            onToggleBookmark={onToggleBookmark}
            questions={questions}
          />
        ) : (
          <AskInline
            file={file}
            onShowQuestionSource={onShowQuestionSource}
            questions={questions}
          />
        )}
      </div>
    </div>
  );
}

/* ── Quiz / Exam ──────────────────────────────────────────────── */

function InlineQuizMode({
  file,
  questions,
  bookmarkedQuestionIds,
  questionAnswers,
  onToggleBookmark,
  onRecordAnswer,
  onExplain,
  onShowQuestionSource,
  fullPage = false,
}: {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  bookmarkedQuestionIds: Set<string>;
  questionAnswers: Record<string, QuestionAnswer>;
  onToggleBookmark: (questionId: string) => void;
  onRecordAnswer: (questionId: string, answer: QuestionAnswer) => void;
  onExplain: (question: PdfMcq) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
  fullPage?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const sessionChrome = useStudySessionChromeOptional();

  const question = questions[index];
  const questionId = question ? getQuestionId(file, question, index) : "";
  const answerState = questionId ? questionAnswers[questionId] : undefined;
  const isBookmarked = questionId ? bookmarkedQuestionIds.has(questionId) : false;
  const isLastQuestion = index >= questions.length - 1;

  useEffect(() => {
    if (!fullPage || !sessionChrome || finished || !questions.length || !question) {
      sessionChrome?.resetChrome();
      return;
    }

    sessionChrome.setChrome({
      variant: "default",
      center: (
        <div className="flex items-center gap-2">
          <span className="min-w-[3.5rem] text-center text-sm font-bold text-slate-500">
            {index + 1} / {questions.length}
          </span>
          <button
            className={`grid size-9 place-items-center rounded-full transition ${
              isBookmarked
                ? "bg-amber-100 text-amber-600"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
            onClick={() => onToggleBookmark(questionId)}
            type="button"
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
          >
            <Flag className="size-4" fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          {onShowQuestionSource && canShowQuestionSource(question, file.source) ? (
            <button
              className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
              onClick={() => onShowQuestionSource(question)}
              type="button"
              aria-label="View source"
            >
              <ScanSearch className="size-4" />
            </button>
          ) : null}
          <button
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            onClick={() => onExplain(question)}
            type="button"
            aria-label="Explain"
          >
            <MessageSquareText className="size-4" />
          </button>
        </div>
      ),
      right: (
        <div className="flex items-center gap-1.5">
          <button
            className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
            type="button"
            aria-label="Previous question"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            className={`grid size-9 place-items-center rounded-full text-white shadow-sm transition disabled:opacity-30 ${
              isLastQuestion && answerState
                ? "bg-emerald-500 hover:bg-emerald-600"
                : "bg-zinc-950 hover:bg-zinc-800"
            }`}
            onClick={() => {
              if (isLastQuestion && answerState) {
                setFinished(true);
              } else if (!isLastQuestion) {
                setIndex((i) => i + 1);
              }
            }}
            type="button"
            aria-label={isLastQuestion && answerState ? "See results" : "Next question"}
          >
            {isLastQuestion && answerState ? (
              <Trophy className="size-4" />
            ) : (
              <ChevronRight className="size-5" />
            )}
          </button>
        </div>
      ),
    });

    return () => sessionChrome.resetChrome();
  }, [
    answerState,
    file.source,
    finished,
    fullPage,
    index,
    isBookmarked,
    isLastQuestion,
    onExplain,
    onShowQuestionSource,
    onToggleBookmark,
    question,
    questionId,
    questions.length,
    sessionChrome,
  ]);

  if (!questions.length) {
    return <EmptyQuestions message="No questions available." />;
  }

  /* Score screen */
  if (finished) {
    const correct = questions.filter((q, i) =>
      questionAnswers[getQuestionId(file, q, i)]?.isCorrect,
    ).length;
    const total = questions.length;

    return (
      <ScoreScreen
        correct={correct}
        total={total}
        onRetry={() => {
          setFinished(false);
          setIndex(0);
        }}
      />
    );
  }

  const options = getOptions(question);
  const correctAnswer = getCorrectAnswer(question);
  const notes = getNotes(question);

  function selectOption(option: { label: string; text: string }) {
    if (answerState) return;
    const isCorrect = optionMatchesAnswer(option, correctAnswer);
    onRecordAnswer(questionId, { selected: option.label, isCorrect });
  }

  const questionBlock = (
    <div>
      {/* Question text */}
      <h3 className="text-center text-xl font-black leading-8 text-slate-950 sm:text-2xl">
        {getQuestionText(question) || "Question text was not found."}
      </h3>

      <QuestionMedia file={file} question={question} questionIndex={index} />

      {/* Options */}
      <div className="mt-8 grid gap-3">
        {options.map((option) => {
          const picked = answerState?.selected === option.label;
          const isCorrectOption = optionMatchesAnswer(option, correctAnswer);

          let cls =
            "w-full rounded-2xl border-2 border-b-4 px-5 py-4 text-left text-base font-bold transition active:translate-y-0.5 active:border-b-2 ";

          if (!answerState) {
            cls += "border-slate-200 border-b-slate-300 bg-white text-slate-800 hover:border-indigo-300 hover:border-b-indigo-400 hover:bg-indigo-50/40";
          } else if (picked && answerState.isCorrect) {
            cls += "border-green-400 border-b-green-600 bg-green-50 text-green-900";
          } else if (picked && !answerState.isCorrect) {
            cls += "border-red-400 border-b-red-600 bg-red-50 text-red-900";
          } else if (isCorrectOption) {
            cls += "border-green-400 border-b-green-600 bg-green-50 text-green-900";
          } else {
            cls += "border-slate-100 border-b-slate-200 bg-slate-50 text-slate-400 opacity-60";
          }

          return (
            <button
              key={`${option.label}-${option.text}`}
              className={cls}
              disabled={Boolean(answerState)}
              onClick={() => selectOption(option)}
              type="button"
            >
              <span className="flex items-center gap-3">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                    !answerState
                      ? "bg-slate-100 text-slate-500"
                      : picked && answerState.isCorrect
                        ? "bg-green-500 text-white"
                        : picked && !answerState.isCorrect
                          ? "bg-red-500 text-white"
                          : isCorrectOption
                            ? "bg-green-500 text-white"
                            : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {answerState && picked && !answerState.isCorrect ? (
                    <X className="size-3.5" />
                  ) : answerState &&
                    ((picked && answerState.isCorrect) || isCorrectOption) ? (
                    <Check className="size-3.5" />
                  ) : (
                    option.label
                  )}
                </span>
                <span>{option.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Feedback + auto explanation */}
      {answerState ? (
        <div
          className={`mt-5 rounded-3xl p-5 ${
            answerState.isCorrect ? "bg-green-50" : "bg-red-50"
          }`}
        >
          <div className="flex items-center gap-3">
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
            <div>
              <p
                className={`text-base font-black ${
                  answerState.isCorrect ? "text-green-700" : "text-red-700"
                }`}
              >
                {answerState.isCorrect ? "Correct!" : "Incorrect"}
              </p>
              {correctAnswer ? (
                <p
                  className={`text-sm ${
                    answerState.isCorrect ? "text-green-600" : "text-red-600"
                  }`}
                >
                  Answer: {correctAnswer}
                </p>
              ) : null}
            </div>
          </div>
          {notes.length > 0 ? (
            <div className="mt-4 space-y-1.5 text-sm leading-6 text-slate-700">
              {notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const navBar = (
    <div className="flex items-center justify-between gap-2">
      {/* Prev */}
      <button
        className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
        disabled={index === 0}
        onClick={() => setIndex((i) => i - 1)}
        type="button"
        aria-label="Previous question"
      >
        <ChevronLeft className="size-5" />
      </button>

      {/* Middle: counter + flag + source + explain */}
      <div className="flex items-center gap-2">
        <span className="min-w-[4rem] text-center text-sm font-black text-slate-400">
          {index + 1} / {questions.length}
        </span>
        <button
          className={`grid size-10 place-items-center rounded-full transition ${
            isBookmarked
              ? "bg-amber-100 text-amber-600"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
          onClick={() => onToggleBookmark(questionId)}
          type="button"
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
        >
          <Flag className="size-4" fill={isBookmarked ? "currentColor" : "none"} />
        </button>
        {onShowQuestionSource && canShowQuestionSource(question, file.source) ? (
          <button
            className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            onClick={() => onShowQuestionSource(question)}
            type="button"
            aria-label="View source"
          >
            <ScanSearch className="size-4" />
          </button>
        ) : null}
        <button
          className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          onClick={() => onExplain(question)}
          type="button"
          aria-label="Explain"
        >
          <MessageSquareText className="size-4" />
        </button>
      </div>

      {/* Next / Finish */}
      <button
        className={`grid size-12 place-items-center rounded-full text-white shadow-md transition disabled:opacity-30 ${
          isLastQuestion && answerState
            ? "bg-emerald-500 shadow-emerald-500/25 hover:bg-emerald-600"
            : "bg-zinc-950 shadow-zinc-950/10 hover:bg-zinc-800"
        }`}
        disabled={!answerState && false}
        onClick={() => {
          if (isLastQuestion && answerState) {
            setFinished(true);
          } else if (!isLastQuestion) {
            setIndex((i) => i + 1);
          }
        }}
        type="button"
        aria-label={isLastQuestion && answerState ? "See results" : "Next question"}
      >
        {isLastQuestion && answerState ? (
          <Trophy className="size-5" />
        ) : (
          <ChevronRight className="size-5" />
        )}
      </button>
    </div>
  );

  if (fullPage) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 sm:px-6">
        {questionBlock}
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-slate-50 p-4 sm:p-6">
      {questionBlock}
      <div className="mt-6">{navBar}</div>
    </div>
  );
}

/* ── Score Screen ─────────────────────────────────────────────── */

function ScoreScreen({
  correct,
  total,
  onRetry,
}: {
  correct: number;
  total: number;
  onRetry: () => void;
}) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const isPerfect = pct === 100;
  const isGood = pct >= 70;

  return (
    <div className="flex flex-col items-center py-12 text-center" style={{ animation: "slideUp 0.3s ease" }}>
      <div
        className={`grid size-28 place-items-center rounded-full text-white shadow-xl ${
          isPerfect
            ? "bg-emerald-500 shadow-emerald-500/30"
            : isGood
              ? "bg-indigo-500 shadow-indigo-500/30"
              : "bg-amber-500 shadow-amber-500/30"
        }`}
      >
        <Trophy className="size-12" />
      </div>

      <h2 className="mt-6 text-4xl font-black text-slate-950">
        {correct}/{total}
      </h2>
      <p className="mt-1 text-lg font-bold text-slate-500">
        {pct}% correct
      </p>
      <p className="mt-2 text-base font-semibold text-slate-700">
        {isPerfect
          ? "Perfect score! Excellent work 🎉"
          : isGood
            ? "Great job! Keep it up 💪"
            : "Keep practicing, you'll get there 📚"}
      </p>

      <div className="mt-8 grid w-full max-w-xs gap-3">
        <button
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-zinc-950 text-base font-bold text-white shadow-md shadow-zinc-950/10 transition hover:bg-zinc-800"
          onClick={onRetry}
          type="button"
        >
          <RotateCcw className="size-5" />
          Try again
        </button>
        <Link
          className="flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-base font-bold text-slate-700 transition hover:bg-slate-200"
          href="/dashboard"
        >
          Back to library
        </Link>
      </div>
    </div>
  );
}

/* ── Review ───────────────────────────────────────────────────── */

type ReviewFilter = "all" | "flagged" | "incorrect" | "correct";

const REVIEW_PER_PAGE = 5;

const REVIEW_STAT_CONFIGS: Array<{
  key: ReviewFilter;
  label: string;
  icon: typeof List;
  bg: string;
  border: string;
  activeBorder: string;
  numColor: string;
  labelColor: string;
  activeBg: string;
}> = [
  {
    key: "all",
    label: "All questions",
    icon: List,
    bg: "#EEEDFE",
    border: "#AFA9EC",
    activeBorder: "#534AB7",
    numColor: "#3C3489",
    labelColor: "#534AB7",
    activeBg: "#CECBF6",
  },
  {
    key: "flagged",
    label: "Flagged",
    icon: Flag,
    bg: "#FAEEDA",
    border: "#EF9F27",
    activeBorder: "#BA7517",
    numColor: "#633806",
    labelColor: "#854F0B",
    activeBg: "#FAC775",
  },
  {
    key: "incorrect",
    label: "Incorrect",
    icon: XCircle,
    bg: "#FCEBEB",
    border: "#F09595",
    activeBorder: "#E24B4A",
    numColor: "#791F1F",
    labelColor: "#A32D2D",
    activeBg: "#F7C1C1",
  },
  {
    key: "correct",
    label: "Correct",
    icon: CheckCircle,
    bg: "#E1F5EE",
    border: "#5DCAA5",
    activeBorder: "#1D9E75",
    numColor: "#085041",
    labelColor: "#0F6E56",
    activeBg: "#9FE1CB",
  },
];

function ReviewQuestionDetailOverlay({
  file,
  item,
  detailIdx,
  filteredLength,
  questionAnswers,
  bookmarkedQuestionIds,
  onClose,
  onNavigate,
  onToggleBookmark,
  onExplain,
  onShowQuestionSource,
  fullPage = false,
}: {
  file: PdfFileQueueItem;
  item: { question: PdfMcq; index: number };
  detailIdx: number;
  filteredLength: number;
  questionAnswers: Record<string, QuestionAnswer>;
  bookmarkedQuestionIds: Set<string>;
  onClose: () => void;
  onNavigate: (dir: number) => void;
  onToggleBookmark: (questionId: string) => void;
  onExplain: (question: PdfMcq) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
  fullPage?: boolean;
}) {
  const { question, index } = item;
  const questionId = getQuestionId(file, question, index);
  const answer = questionAnswers[questionId];
  const options = getOptions(question);
  const correctAnswer = getCorrectAnswer(question);
  const matchedCorrectOption = options.find((option) =>
    optionMatchesAnswer(option, correctAnswer),
  );
  const notes = getNotes(question);
  const isBookmarked = bookmarkedQuestionIds.has(questionId);
  const questionNumber = getQuestionNumber(question, index);
  const tag = question.sourcePage ? `Page ${question.sourcePage}` : file.name;
  const canViewSource = Boolean(
    onShowQuestionSource && canShowQuestionSource(question, file.source),
  );

  return (
    <div
      className={
        fullPage
          ? "flex min-h-screen w-full flex-1 flex-col overflow-hidden bg-white"
          : "fixed inset-0 z-[200] flex h-[100dvh] w-[100dvw] flex-col overflow-hidden bg-white"
      }
      style={{ animation: fullPage ? undefined : "slideUp 0.2s ease" }}
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b-[1.5px] border-[#e5e7eb] bg-white px-4 py-3.5 sm:px-6">
        <button
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-[1.5px] border-[#534AB7] bg-[#EEEDFE] px-3.5 py-1.5 text-[13px] font-medium text-[#3C3489] transition hover:bg-[#CECBF6]"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft size={14} aria-hidden />
          Back to review
        </button>
        <span className="hidden text-[13px] font-medium text-[#6b7280] sm:inline">
          Q{questionNumber} — {tag}
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            className={`grid size-8 place-items-center rounded-lg border-[1.5px] border-[#e5e7eb] bg-white transition ${
              isBookmarked ? "text-[#854F0B]" : "text-[#6b7280] hover:bg-[#f9fafb]"
            }`}
            onClick={() => onToggleBookmark(questionId)}
            type="button"
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
          >
            <Flag size={14} fill={isBookmarked ? "currentColor" : "none"} />
          </button>
          {canViewSource ? (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-[#534AB7] bg-[#EEEDFE] px-2.5 text-[#3C3489] transition hover:bg-[#CECBF6] sm:px-3"
              onClick={() => onShowQuestionSource?.(question)}
              type="button"
              aria-label="View source highlight"
              title="View source highlight"
            >
              <ScanSearch size={14} aria-hidden />
              <span className="hidden text-[12px] font-medium sm:inline">Source</span>
            </button>
          ) : null}
          <button
            className="grid size-8 place-items-center rounded-lg border-[1.5px] border-[#e5e7eb] bg-white text-[#6b7280] transition hover:bg-[#f9fafb]"
            onClick={() => onExplain(question)}
            type="button"
            aria-label="Explain"
          >
            <MessageSquareText size={14} />
          </button>
          <button
            className="grid size-8 place-items-center rounded-lg border-[1.5px] border-[#e5e7eb] bg-white transition disabled:cursor-not-allowed disabled:opacity-35"
            disabled={detailIdx === 0}
            onClick={() => onNavigate(-1)}
            type="button"
            aria-label="Previous question"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-10 text-center text-[13px] font-medium text-[#6b7280] sm:min-w-12">
            {detailIdx + 1} / {filteredLength}
          </span>
          <button
            className="grid size-8 place-items-center rounded-lg border-[1.5px] border-[#e5e7eb] bg-white transition disabled:cursor-not-allowed disabled:opacity-35"
            disabled={detailIdx >= filteredLength - 1}
            onClick={() => onNavigate(1)}
            type="button"
            aria-label="Next question"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Question body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-9 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {isBookmarked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#EF9F27] bg-[#FAEEDA] px-2.5 py-0.5 text-[11px] font-medium text-[#633806]">
                <Flag size={10} aria-hidden />
                Flagged
              </span>
            ) : null}
            {answer ? (
              answer.isCorrect ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#5DCAA5] bg-[#E1F5EE] px-2.5 py-0.5 text-[11px] font-medium text-[#085041]">
                  <CheckCircle size={10} aria-hidden />
                  Correct
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#F09595] bg-[#FCEBEB] px-2.5 py-0.5 text-[11px] font-medium text-[#791F1F]">
                  <XCircle size={10} aria-hidden />
                  Incorrect
                </span>
              )
            ) : null}
          </div>

          <p className="mb-7 text-base font-medium leading-[1.65] text-[#111]">
            {getQuestionText(question) || "Question text was not found."}
          </p>

          <QuestionMedia file={file} question={question} questionIndex={index} />

          <div className="flex flex-col gap-2.5">
            {options.map((option) => {
              const isCorrectOption = optionMatchesAnswer(option, correctAnswer);
              const isWrong =
                answer?.selected === option.label && !isCorrectOption;
              const border = isCorrectOption
                ? "#1D9E75"
                : isWrong
                  ? "#E24B4A"
                  : "#e5e7eb";
              const bg = isCorrectOption
                ? "#E1F5EE"
                : isWrong
                  ? "#FCEBEB"
                  : "#f9fafb";
              const letterBg = isCorrectOption
                ? "#1D9E75"
                : isWrong
                  ? "#E24B4A"
                  : "#e5e7eb";
              const letterColor =
                isCorrectOption || isWrong ? "#fff" : "#6b7280";

              return (
                <div
                  key={`${option.label}-${option.text}`}
                  className="flex items-center gap-3 rounded-[10px] border-[1.5px] px-3.5 py-3"
                  style={{ borderColor: border, background: bg }}
                >
                  <span
                    className="grid size-[26px] shrink-0 place-items-center rounded-[7px] text-xs font-medium"
                    style={{ background: letterBg, color: letterColor }}
                  >
                    {isCorrectOption ? (
                      <CheckCircle size={14} />
                    ) : isWrong ? (
                      <XCircle size={14} />
                    ) : (
                      option.label
                    )}
                  </span>
                  <span className="text-sm text-[#111]">{option.text}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-8 space-y-5 border-t border-[#e5e7eb] pt-6">
            <div>
              <p className="mb-2 text-sm font-semibold text-[#111]">Explanation</p>
              {correctAnswer ? (
                <p className="mb-2 text-sm leading-[1.75] text-[#374151]">
                  <span className="font-medium text-[#085041]">Correct answer:</span>{" "}
                  {correctAnswer}
                </p>
              ) : null}
              {question.explanation?.trim() ? (
                <p className="text-sm leading-[1.75] text-[#374151]">
                  {question.explanation.trim()}
                </p>
              ) : notes.length > 0 ? (
                <p className="text-sm leading-[1.75] text-[#374151]">
                  {notes.join(" ")}
                </p>
              ) : matchedCorrectOption ? (
                <p className="text-sm leading-[1.75] text-[#374151]">
                  Best answer: {matchedCorrectOption.label}. {matchedCorrectOption.text}
                </p>
              ) : (
                <p className="text-sm leading-[1.75] text-[#6b7280]">
                  Open the tutor for a focused explanation of this question.
                </p>
              )}
            </div>

            {notes.length > 0 && question.explanation?.trim() ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-[#111]">References</p>
                <ul className="space-y-1">
                  {notes.map((ref, refIndex) => (
                    <li
                      key={`${ref}-${refIndex}`}
                      className="text-sm leading-[1.65] text-[#6b7280]"
                    >
                      {ref}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineReviewMode({
  file,
  questions,
  bookmarkedQuestionIds,
  questionAnswers,
  onToggleBookmark,
  onExplain,
  onShowQuestionSource,
  fullPage = false,
}: {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  bookmarkedQuestionIds: Set<string>;
  questionAnswers: Record<string, QuestionAnswer>;
  onToggleBookmark: (questionId: string) => void;
  onExplain: (question: PdfMcq) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
  fullPage?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<ReviewFilter | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [embeddedDetailIdx, setEmbeddedDetailIdx] = useState<number | null>(null);
  const sessionChrome = useStudySessionChromeOptional();

  const urlDetailIdx = useMemo(() => {
    if (!fullPage) return null;
    const raw = searchParams.get("q");
    if (raw === null) return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return parsed;
  }, [fullPage, searchParams]);

  const buildDetailHref = useCallback(
    (idx: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("q", String(idx));
      return `/dashboard/content/study?${params.toString()}`;
    },
    [searchParams],
  );

  const buildListHref = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    return `/dashboard/content/study?${params.toString()}`;
  }, [searchParams]);

  const counts = useMemo(() => {
    let flagged = 0;
    let incorrect = 0;
    let correct = 0;
    questions.forEach((question, index) => {
      const id = getQuestionId(file, question, index);
      const answer = questionAnswers[id];
      if (bookmarkedQuestionIds.has(id)) flagged += 1;
      if (answer?.isCorrect) correct += 1;
      if (answer && !answer.isCorrect) incorrect += 1;
    });
    return { all: questions.length, flagged, incorrect, correct };
  }, [bookmarkedQuestionIds, file, questionAnswers, questions]);

  const statConfigs = useMemo(
    () =>
      REVIEW_STAT_CONFIGS.map((config) => ({
        ...config,
        count: counts[config.key],
      })),
    [counts],
  );

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question, index }) => {
        const id = getQuestionId(file, question, index);
        const answer = questionAnswers[id];
        const bookmarked = bookmarkedQuestionIds.has(id);

        if (filter === "flagged" && !bookmarked) return false;
        if (filter === "incorrect" && (!answer || answer.isCorrect)) return false;
        if (filter === "correct" && (!answer || !answer.isCorrect)) return false;

        if (!normalized) return true;
        const questionText = getQuestionText(question).toLowerCase();
        const pageTag = question.sourcePage ? `page ${question.sourcePage}` : "";
        return (
          questionText.includes(normalized) ||
          pageTag.includes(normalized)
        );
      });
  }, [bookmarkedQuestionIds, file, filter, questionAnswers, questions, search]);

  const safeEmbeddedDetailIdx =
    embeddedDetailIdx !== null && embeddedDetailIdx < filtered.length ? embeddedDetailIdx : null;
  const activeDetailIdx = fullPage ? urlDetailIdx : safeEmbeddedDetailIdx;

  const totalPages = Math.max(1, Math.ceil(filtered.length / REVIEW_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice(
    (safePage - 1) * REVIEW_PER_PAGE,
    safePage * REVIEW_PER_PAGE,
  );

  useEffect(() => {
    if (!fullPage || !sessionChrome) return;

    if (activeDetailIdx !== null) {
      sessionChrome.setChrome({ variant: "hidden", center: null, right: null });
      return () => sessionChrome.resetChrome();
    }

    sessionChrome.setChrome({
      variant: "minimal",
      center: (
        <span
          className="max-w-[12rem] truncate text-sm font-semibold text-slate-700 sm:max-w-xs"
          title={file.name}
        >
          {file.name.replace(/\.[^/.]+$/, "")}
        </span>
      ),
      right: null,
    });

    return () => sessionChrome.resetChrome();
  }, [activeDetailIdx, file.name, fullPage, sessionChrome]);

  const handleFilter = (next: ReviewFilter) => {
    setFilter((prev) => (prev === next && next !== "all" ? null : next));
    setPage(1);
  };

  const openDetail = (idx: number) => {
    if (fullPage) {
      router.push(buildDetailHref(idx), { scroll: false });
      return;
    }
    setEmbeddedDetailIdx(idx);
  };

  const closeDetail = () => {
    if (fullPage) {
      router.push(buildListHref(), { scroll: false });
      return;
    }
    setEmbeddedDetailIdx(null);
  };

  const navigateDetail = (dir: number) => {
    if (activeDetailIdx === null) return;
    const next = activeDetailIdx + dir;
    if (next >= 0 && next < filtered.length) openDetail(next);
  };

  useEffect(() => {
    if (!fullPage) return;
    if (urlDetailIdx !== null && urlDetailIdx >= filtered.length) {
      router.replace(buildListHref(), { scroll: false });
    }
  }, [buildListHref, filtered.length, fullPage, router, urlDetailIdx]);

  useEffect(() => {
    if (activeDetailIdx === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeDetailIdx]);

  if (!questions.length) {
    return <EmptyQuestions message="No questions available." />;
  }

  const detailItem =
    activeDetailIdx !== null ? filtered[activeDetailIdx] ?? null : null;

  if (fullPage && detailItem && activeDetailIdx !== null) {
    return (
      <ReviewQuestionDetailOverlay
        bookmarkedQuestionIds={bookmarkedQuestionIds}
        detailIdx={activeDetailIdx}
        file={file}
        filteredLength={filtered.length}
        fullPage
        item={detailItem}
        onClose={closeDetail}
        onExplain={onExplain}
        onNavigate={navigateDetail}
        onShowQuestionSource={onShowQuestionSource}
        onToggleBookmark={onToggleBookmark}
        questionAnswers={questionAnswers}
      />
    );
  }

  /* List view */
  return (
    <>
      <div
        className={`min-h-[calc(100vh-3.5rem)] bg-white ${
          fullPage ? "flex-1" : ""
        }`}
      >
      <div className="mx-auto max-w-[680px] px-5 py-8">
        <h1 className="mb-6 text-center text-[22px] font-medium text-[#111]">
          Review Questions
        </h1>

        {/* Sticky header */}
        <div className="sticky top-14 z-10 mb-4 border-b-[1.5px] border-[#e5e7eb] bg-white pb-3.5">
          <div className="mb-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
            {statConfigs.map((stat) => {
              const Icon = stat.icon;
              const active = filter === stat.key;
              return (
                <button
                  key={stat.key}
                  className="cursor-pointer rounded-[10px] border-[1.5px] px-3.5 py-2.5 text-left transition-all outline-none"
                  style={{
                    borderColor: active ? stat.activeBorder : stat.border,
                    background: active ? stat.activeBg : stat.bg,
                  }}
                  onClick={() => handleFilter(stat.key)}
                  type="button"
                >
                  <div
                    className="text-2xl font-medium"
                    style={{ color: stat.numColor }}
                  >
                    {stat.count}
                  </div>
                  <div
                    className="mt-0.5 flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: stat.labelColor }}
                  >
                    <Icon size={12} aria-hidden />
                    {stat.label}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9ca3af]"
              aria-hidden
            />
            <input
              className="box-border w-full rounded-full border-[1.5px] border-[#e5e7eb] bg-[#f9fafb] py-2 pr-3.5 pl-9 text-[13px] text-[#111] outline-none placeholder:text-[#9ca3af]"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search questions..."
              type="text"
              value={search}
            />
          </div>
        </div>

        {/* Question cards */}
        <div className="flex flex-col gap-2">
          {slice.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#9ca3af]">
              No questions match your search.
            </div>
          ) : (
            slice.map((item, sliceIndex) => {
              const { question, index } = item;
              const id = getQuestionId(file, question, index);
              const answer = questionAnswers[id];
              const bookmarked = bookmarkedQuestionIds.has(id);
              const absIdx = (safePage - 1) * REVIEW_PER_PAGE + sliceIndex;
              const questionNumber = getQuestionNumber(question, index);
              const tag = question.sourcePage
                ? `Page ${question.sourcePage}`
                : "Question";
              const canViewSource = Boolean(
                onShowQuestionSource &&
                  canShowQuestionSource(question, file.source),
              );

              return fullPage ? (
                <Link
                  key={id}
                  className="block cursor-pointer rounded-xl border-[1.5px] border-[#e5e7eb] bg-white px-4 py-3.5 transition-colors hover:border-[#a5a0f0]"
                  href={buildDetailHref(absIdx)}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#534AB7]">
                      Q{questionNumber}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {bookmarked ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#FAEEDA] px-2 py-0.5 text-[11px] font-medium text-[#633806]">
                          <Flag size={10} aria-hidden />
                          Flagged
                        </span>
                      ) : null}
                      {answer ? (
                        answer.isCorrect ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#E1F5EE] px-2 py-0.5 text-[11px] font-medium text-[#085041]">
                            <CheckCircle size={10} aria-hidden />
                            Correct
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FCEBEB] px-2 py-0.5 text-[11px] font-medium text-[#791F1F]">
                            <XCircle size={10} aria-hidden />
                            Incorrect
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>
                  <p className="mb-2 line-clamp-2 text-sm leading-[1.55] text-[#111]">
                    {getQuestionText(question)}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="rounded-[5px] border border-[#e5e7eb] bg-[#f3f4f6] px-2 py-0.5 text-[11px] text-[#6b7280]">
                      {tag}
                    </span>
                    <ChevronRight size={14} className="text-[#9ca3af]" aria-hidden />
                  </div>
                </Link>
              ) : (
                <div
                  key={id}
                  className="cursor-pointer rounded-xl border-[1.5px] border-[#e5e7eb] bg-white px-4 py-3.5 transition-colors hover:border-[#a5a0f0]"
                  onClick={() => openDetail(absIdx)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetail(absIdx);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#534AB7]">
                      Q{questionNumber}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {bookmarked ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#FAEEDA] px-2 py-0.5 text-[11px] font-medium text-[#633806]">
                          <Flag size={10} aria-hidden />
                          Flagged
                        </span>
                      ) : null}
                      {answer ? (
                        answer.isCorrect ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#E1F5EE] px-2 py-0.5 text-[11px] font-medium text-[#085041]">
                            <CheckCircle size={10} aria-hidden />
                            Correct
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FCEBEB] px-2 py-0.5 text-[11px] font-medium text-[#791F1F]">
                            <XCircle size={10} aria-hidden />
                            Incorrect
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>
                  <p className="mb-2 line-clamp-2 text-sm leading-[1.55] text-[#111]">
                    {getQuestionText(question)}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="rounded-[5px] border border-[#e5e7eb] bg-[#f3f4f6] px-2 py-0.5 text-[11px] text-[#6b7280]">
                      {tag}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {canViewSource ? (
                        <button
                          className="grid size-7 place-items-center rounded-md border border-[#e5e7eb] bg-white text-[#534AB7] transition hover:border-[#534AB7] hover:bg-[#EEEDFE]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onShowQuestionSource?.(question);
                          }}
                          type="button"
                          aria-label="View source highlight"
                          title="View source highlight"
                        >
                          <ScanSearch size={13} aria-hidden />
                        </button>
                      ) : null}
                      <ChevronRight size={14} className="text-[#9ca3af]" aria-hidden />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="mt-5 flex items-center justify-center gap-1.5 border-t-[1.5px] border-[#e5e7eb] pt-4">
            <button
              className="grid size-[30px] place-items-center rounded-[7px] border-[1.5px] border-[#e5e7eb] bg-white transition disabled:cursor-not-allowed disabled:opacity-35"
              disabled={safePage === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, pageIndex) => pageIndex + 1).map(
              (pageNumber) => (
                <button
                  key={pageNumber}
                  className="grid size-[30px] cursor-pointer place-items-center rounded-[7px] border-[1.5px] text-[13px] transition"
                  style={{
                    borderColor:
                      pageNumber === safePage ? "#534AB7" : "#e5e7eb",
                    background: pageNumber === safePage ? "#EEEDFE" : "#fff",
                    color: pageNumber === safePage ? "#3C3489" : "#374151",
                    fontWeight: pageNumber === safePage ? 500 : 400,
                  }}
                  onClick={() => setPage(pageNumber)}
                  type="button"
                >
                  {pageNumber}
                </button>
              ),
            )}
            <button
              className="grid size-[30px] place-items-center rounded-[7px] border-[1.5px] border-[#e5e7eb] bg-white transition disabled:cursor-not-allowed disabled:opacity-35"
              disabled={safePage === totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              type="button"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
            <span className="ml-1 text-xs text-[#9ca3af]">
              {(safePage - 1) * REVIEW_PER_PAGE + 1}–
              {Math.min(safePage * REVIEW_PER_PAGE, filtered.length)} of{" "}
              {filtered.length}
            </span>
          </div>
        ) : null}
      </div>
      </div>

      {typeof document !== "undefined" && !fullPage && detailItem && activeDetailIdx !== null
        ? createPortal(
            <ReviewQuestionDetailOverlay
              bookmarkedQuestionIds={bookmarkedQuestionIds}
              detailIdx={activeDetailIdx}
              file={file}
              filteredLength={filtered.length}
              item={detailItem}
              onClose={closeDetail}
              onExplain={onExplain}
              onNavigate={navigateDetail}
              onShowQuestionSource={onShowQuestionSource}
              onToggleBookmark={onToggleBookmark}
              questionAnswers={questionAnswers}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/* ── Flashcards (Anki-style) ──────────────────────────────────── */

type FlashcardRating = "again" | "hard" | "good" | "easy";

const FLASHCARD_RATINGS: Array<{
  id: FlashcardRating;
  label: string;
  interval: string;
}> = [
  { id: "again", label: "Again", interval: "<1m" },
  { id: "hard", label: "Hard", interval: "<6m" },
  { id: "good", label: "Good", interval: "<10m" },
  { id: "easy", label: "Easy", interval: "5d" },
];

const MCQ_STEM_PATTERN =
  /\b(which of the following|what is the (most|best)|select the|choose the correct|all of the following)\b/i;

export function getFlashcardKey(question: PdfMcq) {
  const questionText = getQuestionText(question);
  const notes = getNotes(question);
  const correctAnswer = getCorrectAnswer(question);

  const isMcqStem =
    MCQ_STEM_PATTERN.test(questionText) ||
    (/\?$/.test(questionText.trim()) &&
      /\b(which|what|how|when|where|why)\b/i.test(questionText));

  if (isMcqStem) {
    if (notes[0]?.trim()) {
      return notes[0].trim();
    }

    const keyLearning = getKeyLearning(question);
    if (
      keyLearning.trim() &&
      keyLearning.trim().toLowerCase() !== questionText.trim().toLowerCase() &&
      !keyLearning.startsWith("No key learning extracted")
    ) {
      return keyLearning.trim();
    }

    if (questionText.trim()) {
      return questionText.trim();
    }
  }

  if (!isMcqStem && questionText.trim()) {
    if (questionText.trim().toLowerCase() !== correctAnswer.trim().toLowerCase()) {
      return questionText.trim();
    }
  }

  if (notes[0]?.trim()) {
    return notes[0].trim();
  }

  const keyLearning = getKeyLearning(question);
  if (
    keyLearning.toLowerCase() !== correctAnswer.trim().toLowerCase() &&
    !keyLearning.startsWith("No key learning extracted")
  ) {
    return keyLearning;
  }

  return questionText.trim() || "No key";
}

export function getFlashcardAnswer(question: PdfMcq) {
  const key = getFlashcardKey(question);
  const correctAnswer = getCorrectAnswer(question);
  const notes = getNotes(question);
  const matchedOption = getOptions(question).find((option) =>
    optionMatchesAnswer(option, correctAnswer),
  );

  const parts: string[] = [];
  if (matchedOption) {
    parts.push(matchedOption.text);
  } else if (correctAnswer.trim()) {
    parts.push(correctAnswer.trim());
  }

  const extraNotes = notes.filter(
    (note) => note.trim().toLowerCase() !== key.trim().toLowerCase(),
  );
  parts.push(...extraNotes);

  if (question.explanation?.trim()) {
    parts.push(question.explanation.trim());
  }

  const unique = parts.filter(
    (part, index) =>
      part.trim() &&
      parts.findIndex(
        (candidate) =>
          candidate.trim().toLowerCase() === part.trim().toLowerCase(),
      ) === index,
  );

  return unique.join("\n\n") || "No answer available";
}

function getFlashcardTag(question: PdfMcq, index: number) {
  if (question.sourcePage) {
    return `Page ${question.sourcePage}`;
  }
  return `Card ${getQuestionNumber(question, index)}`;
}

function getFlashcardListAnswer(question: PdfMcq) {
  const answer = getFlashcardAnswer(question);
  if (answer !== "No answer available") {
    return answer;
  }

  const correctAnswer = getCorrectAnswer(question);
  const options = getOptions(question);
  const matchedOption = options.find((option) =>
    optionMatchesAnswer(option, correctAnswer),
  );
  if (matchedOption) {
    return matchedOption.text;
  }

  const notes = getNotes(question);
  if (notes.length > 0) {
    return notes.join("\n\n");
  }

  if (options.length > 0) {
    return options.map((option) => `${option.label}. ${option.text}`).join("\n");
  }

  return answer;
}

type FlashcardPhase = "list" | "review" | "done";

function speakFlashcardText(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

function FlashcardListRow({
  answer,
  isStarred,
  onOpen,
  onToggleStar,
  question,
  questionNumber,
  tag,
}: {
  answer: string;
  isStarred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  question: string;
  questionNumber: number;
  tag: string;
}) {
  const previewAnswer = answer.split("\n\n")[0] ?? answer;
  const hasAnswer = previewAnswer !== "No answer available";

  return (
    <div className="relative overflow-hidden rounded-xl border-[1.5px] border-[#e5e7eb] bg-white">
      <button
        className="absolute inset-0 z-0 rounded-xl"
        onClick={onOpen}
        type="button"
        aria-label={`Review card: ${question}`}
      />

      <div className="relative z-10 grid grid-cols-[1fr_1px_1fr]">
        <div className="px-5 py-[18px]">
          <div className="mb-2 text-[11px] font-medium text-[#534AB7]">
            Q{questionNumber}
          </div>
          <p className="text-sm leading-relaxed text-[#111]">{question}</p>
        </div>
        <div className="bg-[#e5e7eb]" />
        <div className="relative px-5 py-[18px]">
          <div className="absolute right-3.5 top-3 flex gap-1.5">
            <button
              className={`relative z-20 grid size-7 place-items-center rounded-md border-[1.5px] border-[#e5e7eb] ${
                isStarred ? "bg-[#FAEEDA]" : "bg-white"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleStar();
              }}
              type="button"
              aria-label={isStarred ? "Unstar card" : "Star card"}
            >
              <Star
                className="size-3.5"
                fill={isStarred ? "#EF9F27" : "none"}
                color={isStarred ? "#EF9F27" : "#9ca3af"}
              />
            </button>
            <button
              className="relative z-20 grid size-7 place-items-center rounded-md border-[1.5px] border-[#e5e7eb] bg-white"
              onClick={(event) => {
                event.stopPropagation();
                speakFlashcardText(`${question}. ${previewAnswer}`);
              }}
              type="button"
              aria-label="Read card aloud"
            >
              <Volume2 className="size-3.5" color="#9ca3af" />
            </button>
          </div>
          <p
            className={`mt-5 text-[13px] leading-relaxed ${
              hasAnswer ? "text-[#6b7280]" : "italic text-[#9ca3af]"
            }`}
          >
            {hasAnswer ? previewAnswer : "No answer available"}
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-[#f3f4f6] bg-[#fafafa] px-5 py-2">
        <span className="rounded border border-[#e5e7eb] bg-[#f3f4f6] px-2 py-0.5 text-[11px] text-[#6b7280]">
          {tag}
        </span>
        <ChevronRight className="size-3.5 text-[#9ca3af]" aria-hidden />
      </div>
    </div>
  );
}

function FlashcardsInline({
  file,
  questions,
  onExplain,
  onShowQuestionSource,
  fullPage = false,
}: {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  onExplain: (question: PdfMcq) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
  fullPage?: boolean;
}) {
  const [phase, setPhase] = useState<FlashcardPhase>("list");
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const sessionChrome = useStudySessionChromeOptional();

  const filteredIndices = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return questions.map((_, index) => index);
    }

    return questions.reduce<number[]>((matches, question, index) => {
      const key = getFlashcardKey(question).toLowerCase();
      const answer = getFlashcardAnswer(question).toLowerCase();
      if (key.includes(term) || answer.includes(term)) {
        matches.push(index);
      }
      return matches;
    }, []);
  }, [questions, search]);

  const filterKey = filteredIndices.join(",");
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (phase !== "review") {
      prevFilterKeyRef.current = filterKey;
      return;
    }
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    const timeout = window.setTimeout(() => {
      setQueue([...filteredIndices]);
      setRevealed(false);
      if (filteredIndices.length === 0) {
        setPhase("list");
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [filterKey, filteredIndices, phase]);

  const startReview = useCallback(
    (startAtIndex?: number, shuffled = false) => {
      let indices = [...filteredIndices];
      if (!indices.length) return;

      if (shuffled) {
        indices.sort(() => Math.random() - 0.5);
      }

      if (startAtIndex !== undefined && indices.includes(startAtIndex)) {
        indices = [
          startAtIndex,
          ...indices.filter((index) => index !== startAtIndex),
        ];
      }

      setSessionStartedAt(Date.now());
      setQueue(indices);
      setRevealed(false);
      setPhase("review");
    },
    [filteredIndices],
  );

  const starredCount = starred.size;
  const topicCount = useMemo(
    () =>
      new Set(
        filteredIndices.map((index) => getFlashcardTag(questions[index], index)),
      ).size,
    [filteredIndices, questions],
  );

  const currentIndex = queue[0];
  const question = currentIndex === undefined ? null : questions[currentIndex];
  const progressTotal = filteredIndices.length;
  const reviewedCount = progressTotal - queue.length;

  useEffect(() => {
    if (!fullPage || !sessionChrome) return;

    if (phase === "list") {
      sessionChrome.setChrome({
        variant: "minimal",
        center: null,
        right: null,
      });
      return () => sessionChrome.resetChrome();
    }

    if (phase === "done") {
      sessionChrome.setChrome({
        variant: "default",
        center: (
          <span className="text-sm font-semibold text-slate-700">Review complete</span>
        ),
        right: null,
      });
      return () => sessionChrome.resetChrome();
    }

    sessionChrome.setChrome({
      variant: "default",
      center: (
        <span className="text-sm font-bold text-slate-500">
          {progressTotal ? reviewedCount + 1 : 0} / {progressTotal || questions.length}
        </span>
      ),
      right: (
        <span className="text-xs font-semibold text-slate-400">
          {known.size} learned
        </span>
      ),
    });

    return () => sessionChrome.resetChrome();
  }, [
    filteredIndices.length,
    fullPage,
    known.size,
    phase,
    progressTotal,
    questions.length,
    reviewedCount,
    sessionChrome,
  ]);

  const finishFlashcardSession = useCallback(
    (knownCount: number) => {
      if (sessionStartedAt) {
        saveQuizSession({
          id: `${file.id}-flashcards-${Date.now()}`,
          fileId: file.id,
          fileName: file.name,
          mode: "flashcards",
          startedAt: sessionStartedAt,
          finishedAt: Date.now(),
          correct: knownCount,
          total: questions.length,
          durationMs: Date.now() - sessionStartedAt,
        });
      }
      setPhase("done");
    },
    [file.id, file.name, questions.length, sessionStartedAt],
  );

  const handleRating = useCallback(
    (rating: FlashcardRating) => {
      const cardIndex = queue[0];
      if (cardIndex === undefined) return;

      let nextKnown = known;
      if (rating === "good" || rating === "easy") {
        nextKnown = new Set(known);
        nextKnown.add(cardIndex);
        setKnown(nextKnown);
      }

      setRevealed(false);

      let nextQueue: number[];
      if (rating === "again") {
        if (queue.length <= 1) {
          nextQueue = [...queue];
        } else {
          const insertAt = Math.min(2, queue.length - 1);
          nextQueue = [
            ...queue.slice(1, insertAt + 1),
            queue[0],
            ...queue.slice(insertAt + 1),
          ];
        }
      } else if (rating === "hard") {
        if (queue.length <= 1) {
          nextQueue = [...queue];
        } else {
          const insertAt = Math.min(4, queue.length - 1);
          nextQueue = [
            ...queue.slice(1, insertAt + 1),
            queue[0],
            ...queue.slice(insertAt + 1),
          ];
        }
      } else {
        nextQueue = queue.slice(1);
      }

      if (nextQueue.length === 0) {
        finishFlashcardSession(nextKnown.size);
        return;
      }

      setQueue(nextQueue);
    },
    [finishFlashcardSession, known, queue],
  );

  useEffect(() => {
    if (phase !== "review") return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.code === "Space" && question && !revealed) {
        event.preventDefault();
        setRevealed(true);
        return;
      }

      if (!revealed || !question) return;

      const ratingByKey: Record<string, FlashcardRating> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy",
      };
      const rating = ratingByKey[event.key];
      if (rating) {
        event.preventDefault();
        handleRating(rating);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRating, phase, question, revealed]);

  if (!questions.length) return <EmptyQuestions message="No flashcards available." />;

  if (phase === "list") {
    const stats = [
      {
        label: "Total cards",
        value: filteredIndices.length,
        icon: List,
        bg: "bg-[#EEEDFE]",
        border: "border-[#AFA9EC]",
        num: "text-[#3C3489]",
        lbl: "text-[#534AB7]",
      },
      {
        label: "Starred",
        value: starredCount,
        icon: Star,
        bg: "bg-[#FAEEDA]",
        border: "border-[#EF9F27]",
        num: "text-[#633806]",
        lbl: "text-[#854F0B]",
      },
      {
        label: "Topics",
        value: topicCount,
        icon: CheckCircle,
        bg: "bg-[#E1F5EE]",
        border: "border-[#5DCAA5]",
        num: "text-[#085041]",
        lbl: "text-[#0F6E56]",
      },
    ] as const;

    return (
      <div className="mx-auto w-full max-w-[680px] flex-1 px-5 py-8">
        <h1 className="mb-6 text-center text-[22px] font-medium text-[#111]">
          Flashcards
        </h1>

        <div className="mb-4 border-b-[1.5px] border-[#e5e7eb] bg-white pb-3.5">
          <div className="mb-3 grid grid-cols-3 gap-2">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  className={`rounded-[10px] border-[1.5px] ${stat.border} ${stat.bg} px-3.5 py-2.5 text-left`}
                  key={stat.label}
                >
                  <div className={`text-2xl font-medium ${stat.num}`}>
                    {stat.value}
                  </div>
                  <div
                    className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${stat.lbl}`}
                  >
                    <Icon className="size-3" aria-hidden />
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9ca3af]"
              aria-hidden
            />
            <input
              className="h-10 w-full rounded-xl border-[1.5px] border-[#e5e7eb] bg-[#fafafa] pl-9 pr-3 text-sm text-[#111] outline-none transition placeholder:text-[#9ca3af] focus:border-[#AFA9EC] focus:bg-white"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cards..."
              type="search"
              value={search}
            />
          </div>

          <div className="flex gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-none bg-[#534AB7] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#4338a8]"
              disabled={!filteredIndices.length}
              onClick={() => startReview()}
              type="button"
            >
              <Play className="size-3.5" aria-hidden />
              Start studying
            </button>
            <button
              className="flex items-center justify-center gap-1.5 rounded-full border-[1.5px] border-[#e5e7eb] bg-white px-4 py-2.5 text-[13px] font-medium text-[#374151] transition hover:bg-[#fafafa]"
              disabled={!filteredIndices.length}
              onClick={() => startReview(undefined, true)}
              type="button"
            >
              <Shuffle className="size-3.5" aria-hidden />
              Shuffle
            </button>
          </div>

          <p className="mt-2.5 text-center text-[11px] font-medium text-[#9ca3af]">
            {filteredIndices.length} of {questions.length} cards
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {filteredIndices.length ? (
            filteredIndices.map((cardIndex) => {
              const item = questions[cardIndex];
              const cardId = getQuestionId(file, item, cardIndex);
              const questionText = getQuestionText(item);
              const answer = getFlashcardListAnswer(item);

              return (
                <FlashcardListRow
                  answer={answer}
                  isStarred={starred.has(cardId)}
                  key={cardId}
                  onOpen={() => startReview(cardIndex)}
                  onToggleStar={() => {
                    setStarred((current) => {
                      const next = new Set(current);
                      if (next.has(cardId)) next.delete(cardId);
                      else next.add(cardId);
                      return next;
                    });
                  }}
                  question={questionText}
                  questionNumber={getQuestionNumber(item, cardIndex)}
                  tag={getFlashcardTag(item, cardIndex)}
                />
              );
            })
          ) : (
            <p className="py-10 text-center text-sm font-medium text-[#6b7280]">
              No cards match your search.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const knownCount = known.size;
    const total = questions.length;
    return (
      <div
        className="flex flex-col items-center py-12 text-center"
        style={{ animation: "slideUp 0.3s ease" }}
      >
        <div className="grid size-24 place-items-center rounded-full bg-blue-500 text-white shadow-xl shadow-blue-500/25">
          <Trophy className="size-10" />
        </div>
        <h2 className="mt-5 text-3xl font-black text-slate-950">Review complete</h2>
        <p className="mt-1 text-lg font-bold text-slate-500">
          {knownCount} / {total} cards learned
        </p>
        <div className="mt-8 grid w-full max-w-xs gap-3">
          <button
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-zinc-950 text-base font-bold text-white transition hover:bg-zinc-800"
            onClick={() => {
              setKnown(new Set());
              setQueue([]);
              setRevealed(false);
              setPhase("list");
            }}
            type="button"
          >
            <RotateCcw className="size-5" />
            Study again
          </button>
          <Link
            className="flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-base font-bold text-slate-700 transition hover:bg-slate-200"
            href="/dashboard"
          >
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  if (phase !== "review" || !question || currentIndex === undefined) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 text-center sm:px-6">
        <p className="text-sm font-medium text-slate-500">No cards to review.</p>
        <button
          className="mt-4 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
          onClick={() => setPhase("list")}
          type="button"
        >
          Back to card list
        </button>
      </div>
    );
  }

  const key = getFlashcardKey(question);
  const answer = getFlashcardAnswer(question);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-4 sm:px-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[#534AB7] bg-[#EEEDFE] px-3.5 py-1.5 text-xs font-medium text-[#3C3489] transition hover:bg-[#e4e2fc]"
          onClick={() => setPhase("list")}
          type="button"
        >
          <ArrowLeft className="size-3.5" />
          Back to deck
        </button>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="h-10 w-full rounded-xl bg-slate-100 pl-9 pr-3 text-sm text-slate-800 outline-none ring-blue-500/30 transition placeholder:text-slate-400 focus:bg-white focus:ring-2"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search cards..."
            type="search"
            value={search}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
        <p className="max-w-2xl text-xl font-medium leading-8 text-slate-950 sm:text-2xl sm:leading-9">
          {key}
        </p>

        <QuestionMedia
          className="mt-5"
          file={file}
          question={question}
          questionIndex={currentIndex}
        />

        {revealed ? (
          <div
            className="mt-10 max-w-2xl space-y-4"
            style={{ animation: "slideUp 0.25s ease" }}
          >
            {answer.split("\n\n").map((paragraph) => (
              <p
                className="text-xl font-medium leading-8 text-slate-800 sm:text-2xl sm:leading-9"
                key={paragraph}
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <button
            className="mt-10 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            onClick={() => setRevealed(true)}
            type="button"
          >
            Show answer
          </button>
        )}
      </div>

      <div
        className={`mx-auto grid w-full max-w-2xl grid-cols-4 gap-2 transition-opacity duration-200 sm:gap-3 ${
          revealed ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {FLASHCARD_RATINGS.map((rating) => (
          <div className="flex flex-col items-center gap-1" key={rating.id}>
            <span className="text-[11px] font-medium text-slate-700">
              {rating.interval}
            </span>
            <button
              className={`h-11 w-full rounded-lg text-sm font-semibold text-white transition active:translate-y-px sm:h-12 sm:text-[15px] ${
                rating.id === "good"
                  ? "bg-blue-600 shadow-[0_4px_0_#1d4ed8] hover:bg-blue-500"
                  : "bg-blue-500 shadow-[0_3px_0_#2563eb] hover:bg-blue-400"
              }`}
              onClick={() => handleRating(rating.id)}
              type="button"
            >
              {rating.label}
            </button>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-5 flex w-full max-w-2xl items-center justify-between">
        <div className="flex gap-2">
          {onShowQuestionSource && canShowQuestionSource(question, file.source) ? (
            <button
              className="grid size-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              onClick={() => onShowQuestionSource(question)}
              type="button"
              aria-label="View source"
            >
              <ScanSearch className="size-4" />
            </button>
          ) : null}
          <button
            className="grid size-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={() => onExplain(question)}
            type="button"
            aria-label="Explain"
          >
            <MessageSquareText className="size-4" />
          </button>
        </div>
        <p className="max-w-[180px] truncate text-xs font-medium text-slate-400">
          {file.name}
        </p>
      </div>
    </div>
  );
}

/* ── Summary ──────────────────────────────────────────────────── */

type SummaryCard = {
  question: PdfMcq;
  questionId: string;
  questionIndex: number;
};

function SummarySourceModal({
  card,
  file,
  onClose,
  onShowQuestionSource,
}: {
  card: SummaryCard | null;
  file: PdfFileQueueItem;
  onClose: () => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
}) {
  if (!card) return null;

  const { question, questionIndex } = card;
  const keyLearning = getKeyLearning(question);
  const notes = getNotes(question);
  const correctAnswer = getCorrectAnswer(question);
  const options = getOptions(question);
  const matchedOption = options.find((option) =>
    optionMatchesAnswer(option, correctAnswer),
  );
  const detail =
    notes.join(" ") ||
    (matchedOption
      ? `${matchedOption.label}. ${matchedOption.text}`
      : correctAnswer || "No additional detail available.");
  const canViewSource = Boolean(
    onShowQuestionSource && canShowQuestionSource(question, file.source),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-[18px] border-[1.5px] border-slate-200 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-[18px] pb-3.5 pt-[18px]">
          <div className="min-w-0 flex-1">
            <span className="mb-2 inline-block rounded-full bg-slate-700 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
              Q{getQuestionNumber(question, questionIndex)}
            </span>
            <p className="text-sm font-bold leading-relaxed text-slate-800">
              {keyLearning}
            </p>
          </div>
          <button
            className="flex shrink-0 items-center rounded-lg bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="px-[18px] py-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Related question
          </p>
          <p className="mb-4 text-[13px] leading-relaxed text-slate-600">
            {getQuestionText(question)}
          </p>
          <div className="mb-2.5 flex items-center gap-1.5">
            <FileText className="size-3.5 text-slate-500" aria-hidden />
            <span className="text-[13px] font-bold text-slate-800">
              {correctAnswer ? `Answer: ${correctAnswer}` : "Detail"}
            </span>
          </div>
          <p className="text-[13px] leading-[1.8] text-slate-600">{detail}</p>
          {canViewSource ? (
            <button
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 transition hover:text-slate-950"
              onClick={() => {
                onShowQuestionSource?.(question);
                onClose();
              }}
              type="button"
            >
              <ScanSearch className="size-3.5" aria-hidden />
              View in document
            </button>
          ) : null}
          <div className="mt-3.5 flex items-center gap-1.5 border-t border-slate-100 pt-3">
            <ExternalLink className="size-2.5 text-slate-400" aria-hidden />
            <span className="text-[11px] italic text-slate-400">
              {file.result.title || file.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50 px-[18px] py-2.5 text-[11px] text-slate-400">
          <FileText className="size-2.5" aria-hidden />
          {file.name}
          {question.sourcePage ? ` — Page ${question.sourcePage}` : ""}
        </div>
      </div>
    </div>
  );
}

type SummaryMasteryFilter = "all" | "done" | "not-done";

function summaryMasteryFilterLabel(value: SummaryMasteryFilter) {
  if (value === "done") return "Done";
  if (value === "not-done") return "Not done";
  return "Status";
}

function summaryFilterTriggerLabel({
  filterPage,
  filterMastery,
  filterSubject,
  hasSubjects,
}: {
  filterPage: string;
  filterMastery: SummaryMasteryFilter;
  filterSubject: string;
  hasSubjects: boolean;
}) {
  const pageLabel = filterPage ? `Page ${filterPage}` : "Page";
  const statusLabel =
    filterMastery === "all" ? "Status" : summaryMasteryFilterLabel(filterMastery);

  if (hasSubjects) {
    const subjectLabel = filterSubject || "Subject";
    return `${pageLabel} · ${subjectLabel} · ${statusLabel}`;
  }

  return `${pageLabel} · ${statusLabel}`;
}

function SummaryInline({
  file,
  questions,
  bookmarkedQuestionIds,
  onToggleBookmark,
  onShowQuestionSource,
  fullPage = false,
}: {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  bookmarkedQuestionIds?: Set<string>;
  onToggleBookmark?: (questionId: string) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
  fullPage?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [mastered, setMastered] = useState<Set<string>>(() => new Set());
  const [activeCard, setActiveCard] = useState<SummaryCard | null>(null);
  const [filterBookmarks, setFilterBookmarks] = useState(false);
  const [filterPage, setFilterPage] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterMastery, setFilterMastery] = useState<SummaryMasteryFilter>("all");
  const sessionChrome = useStudySessionChromeOptional();

  useEffect(() => {
    if (!fullPage || !sessionChrome) return;

    sessionChrome.setChrome({
      variant: "minimal",
      center: (
        <div className="min-w-0 text-center">
          <p className="text-sm font-black text-slate-900">Summary</p>
          <p className="hidden max-w-[260px] truncate text-[11px] font-medium text-slate-400 sm:block">
            {file.name}
          </p>
        </div>
      ),
      right: null,
    });

    return () => sessionChrome.resetChrome();
  }, [file.name, fullPage, sessionChrome]);

  const pages = useMemo(
    () =>
      [...new Set(questions.map((question) => question.sourcePage).filter(Boolean))]
        .sort((a, b) => Number(a) - Number(b))
        .map(String),
    [questions],
  );

  const subjects = useMemo(() => {
    const stored = Object.values(loadFileSubjects())
      .map((subject) => subject.trim())
      .filter(Boolean);
    const current = getFileSubject(file.id)?.trim();
    return [...new Set([...(current ? [current] : []), ...stored])].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [file.id]);

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedSubject = filterSubject.trim().toLowerCase();
    const fileSubject = getFileSubject(file.id)?.trim().toLowerCase() ?? "";

    return questions.filter((question, index) => {
      const questionId = getQuestionId(file, question, index);
      const questionText = getQuestionText(question).toLowerCase();
      const learningText = getKeyLearning(question).toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        learningText.includes(normalizedSearch) ||
        questionText.includes(normalizedSearch) ||
        `q${getQuestionNumber(question, index)}`.includes(normalizedSearch);
      const matchesBookmark =
        !filterBookmarks || Boolean(bookmarkedQuestionIds?.has(questionId));
      const matchesPage =
        !filterPage || String(question.sourcePage ?? "") === filterPage;
      const matchesSubject =
        !normalizedSubject ||
        fileSubject === normalizedSubject ||
        learningText.includes(normalizedSubject) ||
        questionText.includes(normalizedSubject);
      const isMastered = mastered.has(questionId);
      const matchesMastery =
        filterMastery === "all" ||
        (filterMastery === "done" && isMastered) ||
        (filterMastery === "not-done" && !isMastered);

      return (
        matchesSearch &&
        matchesBookmark &&
        matchesPage &&
        matchesSubject &&
        matchesMastery
      );
    });
  }, [
    bookmarkedQuestionIds,
    file,
    filterBookmarks,
    filterMastery,
    filterPage,
    filterSubject,
    mastered,
    questions,
    search,
  ]);

  const hasFilters = Boolean(
    filterBookmarks || filterPage || filterSubject || filterMastery !== "all",
  );

  function toggleMastered(questionId: string, event: { stopPropagation: () => void }) {
    event.stopPropagation();
    setMastered((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function clearFilters() {
    setFilterPage("");
    setFilterSubject("");
    setFilterMastery("all");
    setFilterBookmarks(false);
  }

  const header = (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[700px] px-4 pb-3 pt-4">
        {questions.length ? (
          <>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="h-9 bg-muted/40 pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search key points..."
                  value={search}
                />
                {search ? (
                  <button
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    onClick={() => setSearch("")}
                    type="button"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      aria-label="Open filters"
                      className="relative h-9 shrink-0 gap-1.5 px-2.5"
                      type="button"
                      variant={hasFilters ? "default" : "outline"}
                    >
                      <SlidersHorizontal className="size-4" />
                      <span className="text-xs font-medium">
                        {summaryFilterTriggerLabel({
                          filterPage,
                          filterMastery,
                          filterSubject,
                          hasSubjects: subjects.length > 0,
                        })}
                      </span>
                      {hasFilters ? (
                        <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-green-500 ring-2 ring-background sm:hidden" />
                      ) : null}
                    </Button>
                  }
                />
                <PopoverContent align="end" className="w-72">
                  <PopoverHeader>
                    <PopoverTitle>Filters</PopoverTitle>
                    <PopoverDescription>
                      Narrow key points by page, subject, status, or saved items.
                    </PopoverDescription>
                  </PopoverHeader>
                  <div className="grid gap-3 pt-1">
                    <div className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Page
                      </span>
                      <Select
                        value={filterPage || "all"}
                        onValueChange={(value) =>
                          setFilterPage(value === "all" || !value ? "" : value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Page">
                            {filterPage ? `Page ${filterPage}` : "Page"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All pages</SelectItem>
                          {pages.map((page) => (
                            <SelectItem key={page} value={page}>
                              Page {page}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {subjects.length ? (
                      <div className="grid gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Subject
                        </span>
                        <Select
                          value={filterSubject || "all"}
                          onValueChange={(value) =>
                            setFilterSubject(value === "all" || !value ? "" : value)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Subject">
                              {filterSubject || "Subject"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All subjects</SelectItem>
                            {subjects.map((subject) => (
                              <SelectItem key={subject} value={subject}>
                                {subject}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Status
                      </span>
                      <Select
                        value={filterMastery}
                        onValueChange={(value) =>
                          setFilterMastery(
                            value === "done" || value === "not-done" ? value : "all",
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status">
                            {summaryMasteryFilterLabel(filterMastery)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                          <SelectItem value="not-done">Not done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full justify-start"
                      onClick={() => setFilterBookmarks((value) => !value)}
                      type="button"
                      variant={filterBookmarks ? "secondary" : "outline"}
                    >
                      <Bookmark
                        className="size-3.5"
                        fill={filterBookmarks ? "currentColor" : "none"}
                      />
                      Saved only
                      {bookmarkedQuestionIds?.size ? (
                        <Badge className="ml-auto" variant="secondary">
                          {bookmarkedQuestionIds.size}
                        </Badge>
                      ) : null}
                    </Button>
                    {hasFilters ? (
                      <Button
                        className="w-full"
                        onClick={clearFilters}
                        type="button"
                        variant="ghost"
                      >
                        Clear filters
                      </Button>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                aria-label={filterBookmarks ? "Show all key points" : "Show saved only"}
                className="hidden size-9 shrink-0 sm:inline-flex"
                onClick={() => setFilterBookmarks((value) => !value)}
                size="icon"
                type="button"
                variant={filterBookmarks ? "default" : "outline"}
              >
                <Bookmark
                  className="size-4"
                  fill={filterBookmarks ? "currentColor" : "none"}
                />
              </Button>
            </div>

            {hasFilters ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {filterPage ? (
                  <Badge className="gap-1 pr-1" variant="secondary">
                    Page {filterPage}
                    <button
                      className="rounded-full p-0.5 hover:bg-background/70"
                      onClick={() => setFilterPage("")}
                      type="button"
                      aria-label="Remove page filter"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ) : null}
                {filterBookmarks ? (
                  <Badge className="gap-1 pr-1" variant="secondary">
                    Saved
                    <button
                      className="rounded-full p-0.5 hover:bg-background/70"
                      onClick={() => setFilterBookmarks(false)}
                      type="button"
                      aria-label="Remove saved filter"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ) : null}
                {filterSubject ? (
                  <Badge className="gap-1 pr-1" variant="secondary">
                    {filterSubject}
                    <button
                      className="rounded-full p-0.5 hover:bg-background/70"
                      onClick={() => setFilterSubject("")}
                      type="button"
                      aria-label="Remove subject filter"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ) : null}
                {filterMastery !== "all" ? (
                  <Badge className="gap-1 pr-1" variant="secondary">
                    {summaryMasteryFilterLabel(filterMastery)}
                    <button
                      className="rounded-full p-0.5 hover:bg-background/70"
                      onClick={() => setFilterMastery("all")}
                      type="button"
                      aria-label="Remove status filter"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ) : null}
                <button
                  className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  onClick={clearFilters}
                  type="button"
                >
                  Clear all
                </button>
              </div>
            ) : null}

            <p className="mt-2.5 text-center text-xs text-muted-foreground">
              {filteredQuestions.length} of {questions.length} key points
            </p>
          </>
        ) : null}
      </div>
    </div>
  );

  const cards = questions.length ? (
    filteredQuestions.length ? (
      <div className="flex flex-col gap-2.5">
        {filteredQuestions.map((question, index) => {
          const originalIndex = questions.indexOf(question);
          const questionIndex = originalIndex >= 0 ? originalIndex : index;
          const questionId = getQuestionId(file, question, questionIndex);
          const isBookmarked = Boolean(bookmarkedQuestionIds?.has(questionId));
          const isMastered = mastered.has(questionId);
          const keyLearning = getKeyLearning(question);

          return (
            <div
              className="cursor-pointer rounded-[14px] border-[1.5px] border-[#DCE6F8] bg-[#F7FAFF] px-4 pb-3 pt-4 shadow-[0_1px_4px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#BFD0F4] hover:shadow-[0_8px_28px_rgba(15,23,42,0.10)]"
              key={questionId}
              onClick={() =>
                setActiveCard({ question, questionId, questionIndex })
              }
            >
              <p className="mb-3.5 break-words text-[15px] font-semibold leading-[1.65] text-slate-800">
                {keyLearning}
              </p>

              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="whitespace-nowrap rounded-full bg-slate-700 px-2.5 py-[3px] text-[11px] font-semibold tracking-wide text-white">
                    Q{getQuestionNumber(question, questionIndex)}
                  </span>
                  {question.sourcePage ? (
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-[3px] text-[11px] font-medium text-slate-500">
                      p.{question.sourcePage}
                    </span>
                  ) : null}
                  {isMastered ? (
                    <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-[3px] text-[11px] font-semibold text-green-600">
                      Done
                    </span>
                  ) : null}
                </div>

                <div
                  className="flex shrink-0 items-center gap-1.5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className={`grid size-8 place-items-center rounded-lg border-[1.5px] transition ${
                      isMastered
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-slate-200 bg-white text-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={(event) => toggleMastered(questionId, event)}
                    title={isMastered ? "Unmark mastered" : "Mark as mastered"}
                    type="button"
                    aria-label={isMastered ? "Unmark mastered" : "Mark as mastered"}
                  >
                    {isMastered ? (
                      <CheckCircle className="size-4" />
                    ) : (
                      <Circle className="size-4" />
                    )}
                  </button>

                  {onToggleBookmark ? (
                    <button
                      className={`grid size-8 place-items-center rounded-lg border-[1.5px] transition ${
                        isBookmarked
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-200 bg-white text-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={() => onToggleBookmark(questionId)}
                      title={isBookmarked ? "Remove bookmark" : "Bookmark"}
                      type="button"
                      aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
                    >
                      <Bookmark
                        className="size-3.5"
                        fill={isBookmarked ? "currentColor" : "none"}
                      />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="py-14 text-center text-slate-400">
        <Search className="mx-auto mb-2.5 block size-8 opacity-20" aria-hidden />
        <p className="text-sm">No key points found</p>
      </div>
    )
  ) : (
    <div className="rounded-[14px] border-[1.5px] border-[#DCE6F8] bg-[#F7FAFF] px-4 py-8 text-center text-sm text-slate-500">
      No key points extracted from this file yet.
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-1 flex-col bg-white">
        <div className="sticky top-14 z-20">{header}</div>
        <div className="mx-auto w-full max-w-[700px] flex-1 px-4 pb-8 pt-4">
          {cards}
        </div>
        <SummarySourceModal
          card={activeCard}
          file={file}
          onClose={() => setActiveCard(null)}
          onShowQuestionSource={onShowQuestionSource}
        />
      </div>
    );
  }

  return (
    <div className="relative max-w-2xl">
      {header}
      <div className="mt-4">{cards}</div>
      <SummarySourceModal
        card={activeCard}
        file={file}
        onClose={() => setActiveCard(null)}
        onShowQuestionSource={onShowQuestionSource}
      />
    </div>
  );
}

/* ── Ask ──────────────────────────────────────────────────────── */

type AskMessage = { role: "user" | "assistant"; text: string };

const ASK_SUGGESTIONS = [
  "Summarize the key topics",
  "What are the hardest questions?",
  "Explain the main concepts",
  "Quiz me on this material",
];

function formatTutorError(message: string) {
  if (/returned no text|empty response/i.test(message)) {
    return "The tutor response was empty. Try sending again, or ask for a shorter answer.";
  }
  return message;
}

async function getAskRetrieval(
  file: PdfFileQueueItem,
  query: string,
): Promise<RagRetrievalResult> {
  const local = getLocalRagRetrieval(file, query);

  try {
    const remote = await convex.action(api.studyRag.searchStudyText, {
      query,
      fileHash: file.id,
      limit: 6,
    });
    const remoteSources = extractRemoteRagSources(remote, file);
    if (remoteSources.length) {
      return {
        context: formatRagContext(remoteSources),
        sources: remoteSources,
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[study-rag] search failed, using local chunks:", error);
    }
  }

  return local;
}

function extractRemoteRagSources(
  response: unknown,
  file: PdfFileQueueItem,
): RagSourceChunk[] {
  const candidates = Array.isArray(response)
    ? response
    : response && typeof response === "object"
      ? Object.values(response as Record<string, unknown>).find(Array.isArray) ?? []
      : [];

  return candidates
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const text = getString(row.text) || getString(row.content) || getString(row.chunk);
      if (!text.trim()) return null;

      const pageNumber =
        getNumber(row.pageNumber) ??
        getNumber((row.metadata as Record<string, unknown> | undefined)?.pageNumber) ??
        Number(text.match(/page\s+(\d+)/i)?.[1] ?? 1);

      return {
        id: getString(row.id) || `remote-${file.id}-${index}`,
        fileId: file.id,
        fileName: file.name,
        pageNumber,
        text: text.trim().replace(/\s+/g, " "),
        citation: `${file.name}, page ${pageNumber}`,
      };
    })
    .filter((source): source is RagSourceChunk => Boolean(source));
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function AskInline({
  file,
  questions,
  fullPage = false,
}: {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  onShowQuestionSource?: (question: PdfMcq) => void;
  fullPage?: boolean;
}) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionChrome = useStudySessionChromeOptional();

  useEffect(() => {
    if (!fullPage || !sessionChrome) return;

    sessionChrome.setChrome({
      variant: "minimal",
      center: (
        <div className="min-w-0 text-center">
          <p className="text-sm font-black text-slate-900">Ask DrNote</p>
          <p className="hidden max-w-[260px] truncate text-[11px] font-medium text-slate-400 sm:block">
            {file.name}
          </p>
        </div>
      ),
      right: null,
    });

    return () => sessionChrome.resetChrome();
  }, [file.name, fullPage, sessionChrome]);

  function scrollToBottom() {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: AskMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages([...nextMessages, { role: "assistant", text: "" }]);
    setDraft("");
    setIsLoading(true);
    scrollToBottom();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const retrieval = await getAskRetrieval(file, trimmed);

    void streamTutorReply({
      system: buildFileAskInstructions(file, questions, {
        retrievalContext: retrieval.context,
        retrievalSourceCount: retrieval.sources.length,
      }),
      messages: nextMessages,
      signal: controller.signal,
      onUpdate: (reply) => {
        setMessages((current) => {
          const updated = [...current];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { role: "assistant", text: reply };
          }
          return updated;
        });
        scrollToBottom();
      },
    })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? formatTutorError(error.message)
            : "Could not reach the AI tutor. Try again.";
        setMessages((current) => {
          const updated = [...current];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.text.trim()) {
            updated[updated.length - 1] = { role: "assistant", text: message };
            return updated;
          }
          return [...updated, { role: "assistant", text: message }];
        });
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsLoading(false);
        scrollToBottom();
      });
  }

  const isEmpty = messages.length === 0;

  if (fullPage) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-1 flex-col bg-white">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
            {isEmpty ? (
              <div className="flex min-h-[54vh] flex-col items-center justify-center text-center">
                <div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm">
                  <MessageSquareText className="size-5" aria-hidden />
                </div>
                <h2 className="mt-5 max-w-md text-[26px] font-semibold tracking-tight text-slate-950">
                  What would you like to know?
                </h2>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Ask anything about {file.name}. {questions.length} questions loaded.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {ASK_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      onClick={() => {
                        void sendMessage(s);
                      }}
                      type="button"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-7 pb-8">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-slate-950 text-[11px] font-black text-white">
                          D
                        </div>
                        <div className="min-w-0 max-w-[82%] rounded-2xl bg-slate-50 px-4 py-3 text-[15px] leading-7 text-slate-800 ring-1 ring-slate-200">
                          {(msg.text || (isLoading && i === messages.length - 1 ? "Thinking…" : ""))
                            .split("\n")
                            .map((line, j) => (
                            <p key={j} className={j > 0 ? "mt-2" : ""}>{line}</p>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="max-w-[78%] rounded-3xl bg-slate-950 px-5 py-3 text-[15px] leading-7 text-white">
                        {msg.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-4 pb-5 pt-2 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-2 rounded-[26px] border border-slate-200 bg-white px-4 py-3 shadow-[0_0_0_1px_rgba(15,23,42,0.03),0_8px_24px_rgba(15,23,42,0.08)]">
              <textarea
                autoFocus
                className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-400"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(draft);
                  }
                }}
                placeholder={`Message about ${file.name}…`}
                rows={1}
                value={draft}
              />
              <button
                className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:opacity-30"
                disabled={!draft.trim() || isLoading}
                onClick={() => {
                  void sendMessage(draft);
                }}
                type="button"
                aria-label="Send"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200/60">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 bg-zinc-950 px-5 py-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-black text-white">
          D
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">DrNote AI</p>
          <p className="text-[11px] text-white/50 truncate">{file.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="grid size-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
            type="button"
            aria-label="Options"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {isEmpty ? (
          /* Greeting bubbles */
          <div className="space-y-2">
            <div className="inline-block max-w-[85%] rounded-2xl rounded-tl-sm bg-[#F0F0F0] px-4 py-3 text-sm leading-6 text-slate-800">
              Hey! I&apos;m your DrNote AI tutor.
            </div>
            <div className="inline-block max-w-[85%] rounded-2xl rounded-tl-sm bg-[#F0F0F0] px-4 py-3 text-sm leading-6 text-slate-800">
              Ask me anything about this file — I&apos;ll help you study smarter.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Greeting always shown */}
            <div className="inline-block max-w-[85%] rounded-2xl rounded-tl-sm bg-[#F0F0F0] px-4 py-3 text-sm leading-6 text-slate-800">
              Hey! I&apos;m your DrNote AI tutor.
            </div>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#F0F0F0] px-4 py-3 text-sm leading-6 text-slate-800">
                    {(msg.text || (isLoading && i === messages.length - 1 ? "Thinking…" : ""))
                      .split("\n")
                      .map((line, j) => (
                      <p key={j} className={j > 0 ? "mt-1" : ""}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-zinc-950 px-4 py-3 text-sm leading-6 text-white">
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      {isEmpty ? (
        <div className="shrink-0 flex flex-wrap justify-end gap-2 px-4 pb-3">
          {ASK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => {
                void sendMessage(s);
              }}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* Powered by */}
      <div className="shrink-0 flex items-center justify-center gap-1.5 pb-2 text-[11px] font-medium text-slate-400">
        <div className="grid size-4 place-items-center rounded-sm bg-zinc-950 text-[8px] font-black text-white">D</div>
        Powered by DrNote
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-slate-100 px-3 pb-4 pt-3">
        <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2.5 transition focus-within:bg-slate-50 focus-within:ring-2 focus-within:ring-slate-200">
          {/* Paperclip */}
          <button
            className="grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:text-slate-600"
            type="button"
            aria-label="Attach file"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <path d="M13.5 6.5l-6 6a2.5 2.5 0 0 0 3.536 3.536l7-7a4.5 4.5 0 0 0-6.364-6.364l-7 7a6.5 6.5 0 0 0 9.192 9.192l5.5-5.5" strokeLinecap="round" />
            </svg>
          </button>

          <input
            autoFocus
            className="flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(draft);
              }
            }}
            placeholder="Ask me anything about DrNote…"
            value={draft}
          />

          {/* Mic */}
          <button
            className="grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:text-slate-600"
            type="button"
            aria-label="Voice input"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4">
              <rect x="7" y="2" width="6" height="10" rx="3" />
              <path d="M4 10a6 6 0 0 0 12 0" strokeLinecap="round" />
              <line x1="10" y1="16" x2="10" y2="18" strokeLinecap="round" />
            </svg>
          </button>

          {/* Send */}
          <button
            className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:opacity-30"
            disabled={!draft.trim() || isLoading}
            onClick={() => {
              void sendMessage(draft);
            }}
            type="button"
            aria-label="Send"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M3.105 3.105a.75.75 0 0 1 .814-.175l14 5.25a.75.75 0 0 1 0 1.64l-14 5.25a.75.75 0 0 1-.976-.97L5.5 10 2.943 4.9a.75.75 0 0 1 .162-.795Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function EmptyQuestions({ message }: { message: string }) {
  return (
    <p className="rounded-3xl bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-400">
      {message}
    </p>
  );
}

export function canShowQuestionSource(question: PdfMcq, source: PdfSource) {
  const preview = getSourcePreview(source);
  return Boolean(
    question.sourceRegion ||
      question.sourcePage ||
      preview.previewUrl ||
      isPdfPreviewMime(preview.previewMimeType) ||
      isImagePreviewMime(preview.previewMimeType) ||
      isImageSource(source) ||
      source.mimeType === "application/pdf" ||
      source.name.toLowerCase().endsWith(".pdf"),
  );
}

export function getQuestionText(question: PdfMcq) {
  const raw = question.questionText ?? question.question ?? "";
  return formatQuestionText(raw);
}

export function getQuestionNumber(question: PdfMcq, index: number) {
  return question.questionNumber ?? index + 1;
}

export function getOptions(question: PdfMcq) {
  return (
    question.options ??
    question.choices?.map((choice, index) => ({
      label: String.fromCharCode(65 + index),
      text: formatOptionText(choice),
    })) ??
    []
  ).map((option) => ({
    label: option.label,
    text: formatOptionText(option.text),
  }));
}

export function getCorrectAnswer(question: PdfMcq) {
  return question.correctAnswer ?? question.answer ?? "";
}

export function getNotes(question: PdfMcq) {
  return question.notes ?? (question.explanation ? [question.explanation] : []);
}

export function getKeyLearning(question: PdfMcq) {
  if (question.explanation?.trim()) {
    return question.explanation.trim();
  }

  const notes = getNotes(question).map((note) => note.trim()).filter(Boolean);
  if (notes.length > 0) {
    return notes.join(" ");
  }

  const correctAnswer = getCorrectAnswer(question);
  const matchedOption = getOptions(question).find((option) =>
    optionMatchesAnswer(option, correctAnswer),
  );

  if (matchedOption) {
    const stem = getQuestionText(question);
    return stem ? `${stem} -> ${matchedOption.text}` : matchedOption.text;
  }

  if (correctAnswer.trim()) {
    const stem = getQuestionText(question);
    return stem
      ? `${stem} -> ${correctAnswer.trim()}`
      : `Correct answer: ${correctAnswer.trim()}`;
  }

  return "No key learning extracted for this question yet.";
}

export function getQuestionId(
  file: PdfFileQueueItem,
  question: PdfMcq,
  index: number,
) {
  return `${file.id}-${getQuestionNumber(question, index)}-${getQuestionText(question).slice(0, 32)}`;
}

export function optionMatchesAnswer(
  option: { label: string; text: string },
  correctAnswer: string,
) {
  const normalized = correctAnswer.trim().toLowerCase();
  if (!normalized) return false;

  const label = normalizeAnswerLabel(option.label);
  const text = option.text.toLowerCase();
  const optionFull = `${label}. ${text}`;

  if (label === normalized || text === normalized || optionFull === normalized) {
    return true;
  }

  const labelOnly = normalizeAnswerLabel(normalized.replace(/\.$/, "").trim());
  if (labelOnly.length === 1 && labelOnly === label) {
    return true;
  }

  return (
    normalized.startsWith(`${label}.`) ||
    normalized.startsWith(`${label} `) ||
    normalized.startsWith(`${label}:`) ||
    normalizeAnswerLabel(normalized.split(/[.\s:]/)[0] ?? "") === label
  );
}
