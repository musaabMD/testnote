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
import type { PdfFileQueueItem, PdfMcq, PdfSource } from "@/lib/pdf-mcqs";
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
  clearQuizProgress,
  loadQuizProgress,
  saveQuizProgress,
} from "@/lib/quiz-progress";
import {
  buildChoiceExplanations,
  getShortQuizFeedback,
  hasUsableExplanationNotes,
} from "@/lib/quiz-tutor-prompt";
import { getTrustedAnswerVerification } from "@/lib/trusted-answer-verification";
import {
  ensureFourOptionSlots,
  isQuizReadyQuestion,
  summarizeQuizReadiness,
} from "@/lib/quiz-questions";
import {
  cleanExplanationText,
  getRawQuestionText,
  getDisplayOptionLabel,
  hasFormattedQuestionVariant,
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
  Clock,
  Bookmark,
  RotateCcw,
  ScanSearch,
  Settings2,
  SpellCheck,
  ThumbsDown,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openPdfDocument } from "@/lib/pdf-document";
import { resolveSourceFileForViewing } from "@/lib/resolve-source-file";
import { convex } from "@/lib/convex-client";

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

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function resolveQuestionIndex(questions: PdfMcq[], question: PdfMcq) {
  const direct = questions.indexOf(question);
  if (direct >= 0) return direct;
  const text = getQuestionText(question);
  const textMatch = questions.findIndex((item) => getQuestionText(item) === text);
  if (textMatch >= 0) return textMatch;
  return Math.max((question.questionNumber ?? 1) - 1, 0);
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

function getSourcePageNumber(question: PdfMcq) {
  const page = question.sourcePage ?? question.sourceRegion?.pageNumber;
  return typeof page === "number" && Number.isInteger(page) && page > 0 ? page : null;
}

function mergeSplitQuestionFragments(questions: PdfMcq[]) {
  const merged: PdfMcq[] = [];

  for (let index = 0; index < questions.length; index += 1) {
    const current = questions[index]!;
    const next = questions[index + 1];

    if (next && shouldMergeQuestionFragment(current, next)) {
      merged.push(mergeQuestionFragment(current, next));
      index += 1;
      continue;
    }

    merged.push(current);
  }

  return merged;
}

function shouldMergeQuestionFragment(current: PdfMcq, next: PdfMcq) {
  const currentText = getRawQuestionText(current);
  const nextText = getRawQuestionText(next);
  if (!currentText || !nextText) return false;

  const currentOptions = getRawOptions(current).filter(
    (option) => !isPlaceholderOptionText(option.text),
  );
  if (currentOptions.length >= 2) return false;

  const currentPage = getSourcePageNumber(current);
  const nextPage = getSourcePageNumber(next);
  if (currentPage && nextPage && currentPage !== nextPage) return false;

  const currentEndsIncomplete =
    /[:;,•-]\s*$/.test(currentText) ||
    /\b(?:random|laboratory results?|lab results?|results?)\s*[:•-]?\s*$/i.test(
      currentText,
    ) ||
    (/\b(?:laboratory|lab|results?)\b/i.test(currentText) && !/[?.]\s*$/.test(currentText));

  const nextStartsContinuation =
    /^(?:blood|abg|hco3|ph\b|glucose|serum|urine|na\b|k\b|cl\b|hba1c|random|fasting|laboratory|lab|results?|ketones|anion|electrolytes|wbc|hb\b|platelets?|creatinine|bun|ast|alt|bilirubin)\b/i.test(
      nextText,
    ) || /^[A-Za-z][A-Za-z\s-]{1,32}:\s*\d/.test(nextText);

  return currentEndsIncomplete || nextStartsContinuation;
}

function mergeQuestionFragment(first: PdfMcq, second: PdfMcq): PdfMcq {
  const firstText = getRawQuestionText(first);
  const secondText = getRawQuestionText(second);
  const firstOptions = getRawOptions(first);
  const secondOptions = getRawOptions(second);
  const sourceChunkIds = [
    ...(first.sourceChunkIds ?? []),
    ...(second.sourceChunkIds ?? []),
  ];

  return {
    ...second,
    ...first,
    questionText: `${firstText} ${secondText}`.replace(/\s+/g, " ").trim(),
    question: `${firstText} ${secondText}`.replace(/\s+/g, " ").trim(),
    choices: second.choices ?? first.choices,
    options: secondOptions.length ? secondOptions : firstOptions,
    answer: second.answer ?? first.answer,
    correctAnswer: second.correctAnswer ?? first.correctAnswer,
    explanation: second.explanation ?? first.explanation,
    notes: [...(first.notes ?? []), ...(second.notes ?? [])],
    sourcePage: first.sourcePage ?? second.sourcePage,
    sourceRegion: first.sourceRegion ?? second.sourceRegion,
    sourceChunkIds: sourceChunkIds.length ? [...new Set(sourceChunkIds)] : undefined,
    imageIds: [...(first.imageIds ?? []), ...(second.imageIds ?? [])],
    imageUrls: [...(first.imageUrls ?? []), ...(second.imageUrls ?? [])],
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

type GrammarFixResponse = {
  error?: string;
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
};

async function fixQuestionGrammar(
  questionText: string,
  options: Array<{ label: string; text: string }>,
): Promise<GrammarFixResponse> {
  const response = await fetch("/api/pdf/fix-grammar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionText,
      options,
    }),
  });
  const data = (await response.json()) as GrammarFixResponse;

  if (!response.ok) {
    throw new Error(data.error ?? "Could not fix grammar.");
  }

  return data;
}

function cleanRepairText(text: string) {
  return text
    .replace(/\s*\/+\s*$/g, "")
    .replace(/\bMostique\b/gi, "Mosquito")
    .replace(/\bfod\b/gi, "food")
    .replace(/\bangiotension\b/gi, "angiotensin")
    .replace(/\bmetanphrines\b/gi, "metanephrines")
    .replace(/\bantiHTN\b/g, "anti-HTN")
    .replace(/\bBBP\b/g, "BP")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRepairOptions(options: Array<{ label: string; text: string }>) {
  return options.map((option) => ({
    ...option,
    text: cleanRepairText(option.text),
  }));
}

type QuizQuestionEntry = {
  question: PdfMcq;
  originalIndex: number;
  pageNumber: number | null;
  validIndex: number;
};

export function QuizModePanel({
  file,
  questions,
  examMode,
  bookmarkedQuestionIds,
  questionAnswers,
  onToggleBookmark,
  onRecordAnswer,
  onShowQuestionSource,
  onShowSourcePage,
  returnHref = "/dashboard",
}: {
  file: PdfFileQueueItem;
  questions: PdfMcq[];
  examMode: boolean;
  bookmarkedQuestionIds: Set<string>;
  questionAnswers: Record<string, QuestionAnswer>;
  onToggleBookmark: (questionId: string) => void;
  onRecordAnswer: (questionId: string, answer: QuestionAnswer) => void;
  onShowQuestionSource?: (question: PdfMcq) => void;
  onShowSourcePage?: (pageNumber: number) => void;
  returnHref?: string;
}) {
  const searchParams = useSearchParams();
  const [index, setIndex] = useState(() => loadQuizProgress(file.id)?.index ?? 0);
  const [finished, setFinished] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(
    () => searchParams.get("customize") === "1",
  );
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
  const [prepFailed, setPrepFailed] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedDurationMs, setCompletedDurationMs] = useState<number | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [sourcePdfPageCount, setSourcePdfPageCount] = useState<number | null>(null);
  const [tutorRequest, setTutorRequest] = useState<{
    question: PdfMcq;
    questionId: string;
    requestId: number;
  } | null>(null);
  const questionEditsRef = useRef(questionEdits);
  const [startedAt] = useState(() => Date.now());
  const sessionChrome = useStudySessionChromeOptional();

  const mergedQuestions = useMemo(
    () => mergeSplitQuestionFragments(questions),
    [questions],
  );
  const validQuestions = useMemo(
    () =>
      mergedQuestions.filter((item) => {
        const itemIndex = resolveQuestionIndex(questions, item);
        const itemId = getQuestionId(file, item, itemIndex);
        return isQuizReadyQuestion(item, questionEdits[itemId]);
      }),
    [file, mergedQuestions, questionEdits, questions],
  );

  const effectiveIndex = Math.min(
    index,
    Math.max(validQuestions.length - 1, 0),
  );

  useEffect(() => {
    questionEditsRef.current = questionEdits;
  }, [questionEdits]);

  useEffect(() => {
    if (finished || validQuestions.length === 0) return;
    saveQuizProgress(file.id, effectiveIndex);
  }, [file.id, finished, effectiveIndex, validQuestions.length]);

  useEffect(() => {
    if (!settings.timerEnabled || finished) return;
    const updateElapsed = () => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [finished, settings.timerEnabled, startedAt]);

  const questionEntries = useMemo<QuizQuestionEntry[]>(
    () =>
      validQuestions.map((item, validIndex) => ({
        question: item,
        originalIndex: resolveQuestionIndex(questions, item),
        pageNumber: getSourcePageNumber(item),
        validIndex,
      })),
    [questions, validQuestions],
  );

  const pageNumbers = useMemo(() => {
    const discoveredPages = questionEntries
      .map((entry) => entry.pageNumber ?? 0)
      .filter((page) => page > 0);
    const chunkPages =
      file.sourceChunks?.map((chunk) => chunk.pageNumber).filter((page) => page > 0) ?? [];
    const fallbackPageCount = Math.max(
      file.pageCount ?? 0,
      ...chunkPages,
      ...discoveredPages,
      0,
    );
    const maxPage = sourcePdfPageCount ?? fallbackPageCount;
    if (maxPage <= 0) return [] as number[];
    return Array.from({ length: maxPage }, (_, pageIndex) => pageIndex + 1);
  }, [file.pageCount, file.sourceChunks, sourcePdfPageCount, questionEntries]);

  useEffect(() => {
    let cancelled = false;

    async function resolvePdfPageCount() {
      const questionPageMax = Math.max(
        0,
        ...questionEntries.map((entry) => entry.pageNumber ?? 0),
      );
      const chunkPageMax = Math.max(
        0,
        ...(file.sourceChunks?.map((chunk) => chunk.pageNumber) ?? []),
      );
      const attempts: Array<{
        source: string;
        pages?: number;
        error?: string;
      }> = [];
      const apiSource: PdfSource = {
        ...file.source,
        name: file.source.name || file.name,
        url: `/api/pdf/source-file/download?fileId=${encodeURIComponent(file.id)}`,
        previewUrl: `/api/pdf/source-file/download?fileId=${encodeURIComponent(file.id)}`,
        mimeType: file.source.mimeType ?? "application/pdf",
        previewMimeType: file.source.previewMimeType ?? "application/pdf",
      };

      for (const candidate of [
        { label: "source-file-api", source: apiSource, fileId: undefined },
        { label: "local-source", source: file.source, fileId: file.id },
      ] as Array<{ label: string; source: PdfSource; fileId?: string }>) {
        try {
          const pdf = await withTimeout(
            openPdfDocument(candidate.source, candidate.fileId),
            8000,
            candidate.label,
          );
          attempts.push({ source: candidate.label, pages: pdf.numPages });
          if (cancelled || pdf.numPages <= 0) return;
          setSourcePdfPageCount(pdf.numPages);
          console.info("[study-pages] resolved source page count", {
            fileId: file.id,
            fileName: file.name,
            pdfPages: pdf.numPages,
            source: candidate.label,
            storedPageCount: file.pageCount ?? null,
            sourceChunkMaxPage: chunkPageMax || null,
            questionMaxPage: questionPageMax || null,
            attempts,
          });
          return;
        } catch (error) {
          attempts.push({
            source: candidate.label,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.warn("[study-pages] using fallback page count", {
        fileId: file.id,
        fileName: file.name,
        storedPageCount: file.pageCount ?? null,
        sourceChunkMaxPage: chunkPageMax || null,
        questionMaxPage: questionPageMax || null,
        attempts,
      });

      withTimeout(resolveSourceFileForViewing(file.id, file.source, { convex }), 8000, "resolved-source")
        .then(async (resolved) => {
          if (!resolved || cancelled) return;
          const pdf = await withTimeout(
            openPdfDocument(resolved.source),
            8000,
            "resolved-source-pdf",
          );
          if (cancelled || pdf.numPages <= 0) return;
          setSourcePdfPageCount(pdf.numPages);
          console.info("[study-pages] resolved source page count", {
            fileId: file.id,
            fileName: file.name,
            pdfPages: pdf.numPages,
            source: "resolved-source",
            storedPageCount: file.pageCount ?? null,
            sourceChunkMaxPage: chunkPageMax || null,
            questionMaxPage: questionPageMax || null,
          });
        })
        .catch((error) => {
          console.warn("[study-pages] delayed source resolution failed", {
            fileId: file.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
    }

    void resolvePdfPageCount();

    return () => {
      cancelled = true;
    };
  }, [file.id, file.name, file.pageCount, file.source, file.sourceChunks, questionEntries]);

  const hasPageBrowser = pageNumbers.length > 1;
  const indexedQuestion = validQuestions[effectiveIndex];
  const indexedQuestionPage = indexedQuestion ? getSourcePageNumber(indexedQuestion) : null;
  const effectiveSelectedPage =
    hasPageBrowser && selectedPage && pageNumbers.includes(selectedPage)
      ? selectedPage
      : indexedQuestionPage ?? pageNumbers[0] ?? null;
  const selectedPageIndex =
    effectiveSelectedPage === null ? -1 : pageNumbers.indexOf(effectiveSelectedPage);
  const pageQuestionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    questionEntries.forEach((entry) => {
      if (!entry.pageNumber) return;
      counts.set(entry.pageNumber, (counts.get(entry.pageNumber) ?? 0) + 1);
    });
    return counts;
  }, [questionEntries]);
  const visibleQuestionEntries =
    hasPageBrowser && effectiveSelectedPage !== null
      ? questionEntries.filter((entry) => entry.pageNumber === effectiveSelectedPage)
      : questionEntries[effectiveIndex]
        ? [questionEntries[effectiveIndex]]
        : [];
  const activeEntry = visibleQuestionEntries[0];
  const question = activeEntry?.question;

  const displayIndex = activeEntry?.originalIndex ?? effectiveIndex;
  const questionId = question ? getQuestionId(file, question, displayIndex) : "";
  const edit = questionId ? questionEdits[questionId] : undefined;
  const pendingSelection =
    pendingSelectionState?.questionId === questionId
      ? pendingSelectionState.label
      : null;
  const optionsForLayout = question ? edit?.options ?? getOptions(question) : [];
  const isRtl = question
    ? isRtlContent(
        [
          edit?.questionText ?? getQuestionText(question),
          ...optionsForLayout.map((option) => option.text),
        ].join(" "),
      )
    : false;
  const answerState = questionId ? questionAnswers[questionId] : undefined;
  const isBookmarked = questionId ? bookmarkedQuestionIds.has(questionId) : false;
  const isLastQuestion = hasPageBrowser
    ? selectedPageIndex >= pageNumbers.length - 1
    : effectiveIndex >= validQuestions.length - 1;
  const canViewSource = Boolean(
    question && onShowQuestionSource && canShowQuestionSource(question, file.source),
  );
  const correctAnswer = question ? getCorrectAnswer(question) : "";

  async function applyGrammarFix() {
    if (fixingGrammar || !question || !questionId) return false;
    setFixingGrammar(true);

    const questionText = edit?.questionText ?? getRawQuestionText(question);
    const rawOptions = edit?.options ?? getRawOptions(question);
    const grammarOptions = rawOptions.length ? rawOptions : ensureFourOptionSlots(rawOptions);

    try {
      const data = await fixQuestionGrammar(questionText, grammarOptions);
      const merged = {
        ...edit,
        questionText: cleanRepairText(data.questionText ?? questionText),
        options: cleanRepairOptions(data.options ?? grammarOptions),
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

  const applyGrammarFixRef = useRef(applyGrammarFix);

  useEffect(() => {
    applyGrammarFixRef.current = applyGrammarFix;
  });

  const goToPage = useCallback(
    (pageNumber: number) => {
      setTutorRequest(null);
      setSelectedPage(pageNumber);
      const firstQuestionOnPage = questionEntries.find(
        (entry) => entry.pageNumber === pageNumber,
      );
      if (firstQuestionOnPage) {
        setIndex(firstQuestionOnPage.validIndex);
      }
    },
    [questionEntries],
  );

  const goNext = useCallback(() => {
    if (hasPageBrowser && effectiveSelectedPage !== null) {
      const nextPage = pageNumbers[selectedPageIndex + 1];
      if (nextPage) {
        goToPage(nextPage);
        return;
      }
      setSubmitPromptOpen(true);
      return;
    }
    setTutorRequest(null);
    if (isLastQuestion) {
      setSubmitPromptOpen(true);
      return;
    }
    setIndex((value) => value + 1);
  }, [
    effectiveSelectedPage,
    goToPage,
    hasPageBrowser,
    isLastQuestion,
    pageNumbers,
    selectedPageIndex,
  ]);

  const goPrev = useCallback(() => {
    if (hasPageBrowser && effectiveSelectedPage !== null) {
      const previousPage = pageNumbers[selectedPageIndex - 1];
      if (previousPage) {
        goToPage(previousPage);
      }
      return;
    }
    setTutorRequest(null);
    setIndex((value) => Math.max(0, value - 1));
  }, [
    effectiveSelectedPage,
    goToPage,
    hasPageBrowser,
    pageNumbers,
    selectedPageIndex,
  ]);

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
        if (hasPageBrowser || answerState || settings.submitMode === "manual") goNext();
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
    if (!sessionChrome || finished || (!question && !hasPageBrowser)) {
      sessionChrome?.resetChrome();
      return;
    }

    sessionChrome.setChrome({
      variant: "default",
      center: (
        <div className="flex items-center gap-2">
          {!hasPageBrowser || effectiveSelectedPage === null ? (
            <span className="min-w-[3.5rem] text-center text-sm font-bold text-slate-500">
              {effectiveIndex + 1} / {validQuestions.length}
            </span>
          ) : null}
          {hasPageBrowser && effectiveSelectedPage !== null ? (
            <span className="hidden rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 sm:inline-flex">
              {validQuestions.length} Q
            </span>
          ) : null}
          {settings.timerEnabled ? (
            <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold tabular-nums text-slate-600 sm:flex">
              <Clock className="size-3.5" aria-hidden />
              {formatElapsedTime(elapsedSeconds)}
            </span>
          ) : null}
          {question ? (
            <button
              className={`grid size-9 place-items-center rounded-full transition ${
                isBookmarked ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
              onClick={() => onToggleBookmark(questionId)}
              type="button"
              aria-label="Bookmark question"
            >
              <Bookmark className="size-4" fill={isBookmarked ? "currentColor" : "none"} />
            </button>
          ) : null}
          {canViewSource ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className="hidden size-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 sm:grid"
                    onClick={() => {
                      if (question) onShowQuestionSource?.(question);
                    }}
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
          {question && !isRtl ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className="hidden size-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50 sm:grid"
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
          {question ? (
            <button
              className="hidden size-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 sm:grid"
              onClick={() => setFeedbackOpen(true)}
              type="button"
              aria-label="Report issue"
            >
              <ThumbsDown className="size-4" />
            </button>
          ) : null}
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
            disabled={hasPageBrowser ? selectedPageIndex <= 0 : effectiveIndex === 0}
            onClick={goPrev}
            type="button"
            aria-label={hasPageBrowser ? "Previous page" : "Previous question"}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            className="grid size-9 place-items-center rounded-full bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-30"
            disabled={
              hasPageBrowser
                ? false
                : settings.submitMode === "auto"
                  ? !answerState
                  : !answerState && !pendingSelection
            }
            onClick={goNext}
            type="button"
            aria-label={
              isLastQuestion
                ? "Submit quiz"
                : hasPageBrowser
                  ? "Next page"
                  : "Next question"
            }
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
    effectiveSelectedPage,
    elapsedSeconds,
    feedbackOpen,
    finished,
    fixingGrammar,
    goNext,
    goPrev,
    effectiveIndex,
    hasPageBrowser,
    isBookmarked,
    isLastQuestion,
    isRtl,
    onShowQuestionSource,
    onToggleBookmark,
    pageQuestionCounts,
    pendingSelection,
    question,
    questionId,
    sessionChrome,
    selectedPageIndex,
    settings.submitMode,
    settings.timerEnabled,
    settingsOpen,
    submitPromptOpen,
    validQuestions.length,
  ]);

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
                  setPrepFailed(false);
                  window.location.reload();
                }}
                type="button"
              >
                Reload
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
              const trustedVerification = getTrustedAnswerVerification(item, itemOptions);
              const breakdown =
                trustedVerification?.choiceExplanations ??
                buildChoiceExplanations(itemOptions, correctAnswer, notes);
              const showItemBreakdown =
                Boolean(trustedVerification?.choiceExplanations.length) ||
                hasUsableExplanationNotes(notes);

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
                  {trustedVerification ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      <p className="font-bold text-slate-900">
                        Verified answer: {trustedVerification.answer}
                      </p>
                      <p className="mt-1">{trustedVerification.explanation}</p>
                      <a
                        className="mt-2 inline-flex font-semibold text-slate-800 underline-offset-4 hover:underline"
                        href={trustedVerification.referenceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Reference: {trustedVerification.referenceLabel}
                      </a>
                    </div>
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
              clearQuizProgress(file.id);
              setFinished(false);
              setIndex(0);
              setTutorRequest(null);
            }}
            type="button"
          >
            <RotateCcw className="size-5" />
            Try again
          </button>
          <Link
            className="flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-base font-bold text-slate-700"
            href={returnHref}
          >
            Back to file details
          </Link>
        </div>
      </div>
    );
  }

  function getEntryQuestionId(entry: QuizQuestionEntry) {
    return getQuestionId(file, entry.question, entry.originalIndex);
  }

  function updateEntryEdit(entry: QuizQuestionEntry, next: QuestionEditRecord) {
    const entryQuestionId = getEntryQuestionId(entry);
    const entryEdit = questionEdits[entryQuestionId];
    const merged = { ...entryEdit, ...next };
    setQuestionEdits((current) => ({ ...current, [entryQuestionId]: merged }));
    saveQuestionEdit(file.id, entryQuestionId, merged);
  }

  function selectEntryOption(
    entry: QuizQuestionEntry,
    option: { label: string; text: string },
  ) {
    const entryQuestionId = getEntryQuestionId(entry);
    if (questionAnswers[entryQuestionId]) return;
    if (settings.submitMode === "manual") {
      setPendingSelectionState({ questionId: entryQuestionId, label: option.label });
      return;
    }
    onRecordAnswer(entryQuestionId, {
      selected: option.label,
      isCorrect: optionMatchesAnswer(option, getCorrectAnswer(entry.question)),
    });
  }

  function checkEntryAnswer(entry: QuizQuestionEntry) {
    const entryQuestionId = getEntryQuestionId(entry);
    const selected = pendingSelectionState?.questionId === entryQuestionId
      ? pendingSelectionState.label
      : null;
    if (!selected) return;
    const entryEdit = questionEdits[entryQuestionId];
    const entryOptions = entryEdit?.options ?? getOptions(entry.question);
    const option = entryOptions.find((item) => item.label === selected);
    if (!option) return;
    onRecordAnswer(entryQuestionId, {
      selected: option.label,
      isCorrect: optionMatchesAnswer(option, getCorrectAnswer(entry.question)),
    });
    setPendingSelectionState(null);
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
    clearQuizProgress(file.id);
    setFinished(true);
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-5 px-4 py-6 lg:px-6">
        {hasPageBrowser && effectiveSelectedPage !== null ? (
          <PageQuestionBrowser
            fileId={file.id}
            onShowPage={onShowSourcePage}
            pageNumbers={pageNumbers}
            questionCounts={pageQuestionCounts}
            selectedPage={effectiveSelectedPage}
            onSelectPage={goToPage}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {hasPageBrowser && effectiveSelectedPage !== null ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Page {effectiveSelectedPage} ({visibleQuestionEntries.length} Question
                  {visibleQuestionEntries.length === 1 ? "" : "s"})
                </h2>
              </div>
            </div>
          ) : null}

          {visibleQuestionEntries.length ? (
            <div className="grid gap-6">
              {visibleQuestionEntries.map((entry) => {
                const entryQuestionId = getEntryQuestionId(entry);
                return (
                  <QuizQuestionCard
                    answerState={questionAnswers[entryQuestionId]}
                    bookmarked={bookmarkedQuestionIds.has(entryQuestionId)}
                    edit={questionEdits[entryQuestionId]}
                    entry={entry}
                    file={file}
                    key={entryQuestionId}
                    onCheckAnswer={() => checkEntryAnswer(entry)}
                    onSelectOption={(option) => selectEntryOption(entry, option)}
                    onShowSource={onShowQuestionSource}
                    onToggleBookmark={() => onToggleBookmark(entryQuestionId)}
                    onToggleOriginal={() =>
                      setShowOriginalQuestionId((current) =>
                        current === entryQuestionId ? null : entryQuestionId,
                      )
                    }
                    onUpdateEdit={(next) => updateEntryEdit(entry, next)}
                    pendingSelection={
                      pendingSelectionState?.questionId === entryQuestionId
                        ? pendingSelectionState.label
                        : null
                    }
                    settings={settings}
                    showOriginal={showOriginalQuestionId === entryQuestionId}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-5 py-14 text-center">
              <p className="text-sm font-bold text-slate-700">
                No extracted quiz questions on this page.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Pick another PDF page from the side menu.
              </p>
            </div>
          )}
        </div>
      </div>

      {question && questionId && !finished && !submitPromptOpen && !settingsOpen && !feedbackOpen ? (
        <QuizFloatingTutor
          explainRequestId={tutorRequest?.requestId}
          key={tutorRequest?.questionId ?? questionId}
          question={tutorRequest?.question ?? question}
        />
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

      {feedbackOpen && question ? (
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

function PageQuestionBrowser({
  fileId,
  onSelectPage,
  onShowPage,
  pageNumbers,
  questionCounts,
  selectedPage,
}: {
  fileId: string;
  onSelectPage: (pageNumber: number) => void;
  onShowPage?: (pageNumber: number) => void;
  pageNumbers: number[];
  questionCounts: Map<number, number>;
  selectedPage: number;
}) {
  const selectedQuestionCount = questionCounts.get(selectedPage) ?? 0;
  const selectedPageIndex = pageNumbers.indexOf(selectedPage);
  const previousPage = selectedPageIndex > 0 ? pageNumbers[selectedPageIndex - 1] : null;
  const nextPage =
    selectedPageIndex >= 0 && selectedPageIndex < pageNumbers.length - 1
      ? pageNumbers[selectedPageIndex + 1]
      : null;
  const sourcePdfHref = `/api/pdf/source-file/download?fileId=${encodeURIComponent(fileId)}`;

  return (
    <nav
      className="fixed bottom-6 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/95 p-2 shadow-xl shadow-slate-950/10 backdrop-blur lg:flex"
      aria-label="Page pagination"
    >
      <button
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!previousPage}
        onClick={() => {
          if (previousPage) onSelectPage(previousPage);
        }}
        type="button"
        aria-label={previousPage ? `Back to page ${previousPage}` : "Already on the first page"}
      >
        <ChevronLeft className="size-4" aria-hidden />
        Back
      </button>

      <div className="min-w-36 px-3 text-center">
        <p className="text-sm font-black text-slate-950">
          Page {selectedPage} / {pageNumbers.length}
        </p>
        <p className="text-[11px] font-bold text-slate-400">
          {selectedQuestionCount} Q
        </p>
      </div>

      {onShowPage ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                onClick={() => onShowPage(selectedPage)}
                type="button"
                aria-label={`View PDF page ${selectedPage}`}
              />
            }
          >
            <ScanSearch className="size-4" aria-hidden />
          </TooltipTrigger>
          <TooltipContent>
            View PDF page {selectedPage}
          </TooltipContent>
        </Tooltip>
      ) : (
        <a
          className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          href={sourcePdfHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Open source PDF"
          title="Open source PDF"
        >
          <ScanSearch className="size-4" aria-hidden />
        </a>
      )}

      <button
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-zinc-950 px-4 text-sm font-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!nextPage}
        onClick={() => {
          if (nextPage) onSelectPage(nextPage);
        }}
        type="button"
        aria-label={nextPage ? `Next to page ${nextPage}` : "Already on the last page"}
      >
        Next
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}

function QuizQuestionCard({
  answerState,
  bookmarked,
  edit,
  entry,
  file,
  onCheckAnswer,
  onSelectOption,
  onShowSource,
  onToggleBookmark,
  onToggleOriginal,
  onUpdateEdit,
  pendingSelection,
  settings,
  showOriginal,
}: {
  answerState?: QuestionAnswer;
  bookmarked: boolean;
  edit?: QuestionEditRecord;
  entry: QuizQuestionEntry;
  file: PdfFileQueueItem;
  onCheckAnswer: () => void;
  onSelectOption: (option: { label: string; text: string }) => void;
  onShowSource?: (question: PdfMcq) => void;
  onToggleBookmark: () => void;
  onToggleOriginal: () => void;
  onUpdateEdit: (next: QuestionEditRecord) => void;
  pendingSelection: string | null;
  settings: PdfQuizSettings;
  showOriginal: boolean;
}) {
  const { question } = entry;
  const options = edit?.options ?? getOptions(question);
  const choicePrepNeeded =
    options.length < 4 || options.some((option) => isPlaceholderOptionText(option.text));
  const correctAnswer = getCorrectAnswer(question);
  const notes = getNotes(question).map(cleanExplanationText).filter(Boolean);
  const trustedVerification = getTrustedAnswerVerification(question, options);
  const choiceBreakdown =
    trustedVerification?.choiceExplanations ??
    buildChoiceExplanations(options, correctAnswer, notes);
  const showChoiceBreakdown =
    Boolean(trustedVerification?.choiceExplanations.length) ||
    hasUsableExplanationNotes(notes);
  const showFeedback = settings.showAnswers === "asIGo" && Boolean(answerState);
  const shortFeedback = answerState && !trustedVerification
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
  const isRtl = isRtlContent(
    [displayQuestionText, ...options.map((option) => option.text)].join(" "),
  );
  const textDirection = isRtl ? "rtl" : "ltr";
  const canViewSource = Boolean(
    onShowSource && canShowQuestionSource(question, file.source),
  );
  const autoRepairAttempted = useRef(false);
  const onUpdateEditRef = useRef(onUpdateEdit);

  useEffect(() => {
    onUpdateEditRef.current = onUpdateEdit;
  }, [onUpdateEdit]);

  useEffect(() => {
    if (autoRepairAttempted.current) return;
    if (choicePrepNeeded) return;

    const questionText = edit?.questionText ?? getRawQuestionText(question);
    const rawOptions = edit?.options ?? getRawOptions(question);
    const grammarOptions = rawOptions.length ? rawOptions : ensureFourOptionSlots(rawOptions);
    if (!questionText.trim()) {
      return;
    }
    if (isRtlContent([questionText, ...grammarOptions.map((option) => option.text)].join(" "))) {
      return;
    }

    let cancelled = false;
    const delayMs = 250 + (entry.validIndex % 6) * 175;

    const timeout = window.setTimeout(async () => {
      autoRepairAttempted.current = true;
      let nextQuestionText = cleanRepairText(questionText);
      let fixedOptions = cleanRepairOptions(grammarOptions);
      let nextOptions = rawOptions.length ? cleanRepairOptions(rawOptions) : rawOptions;

      const localTextChanged = nextQuestionText.trim() !== questionText.trim();
      const localOptionsChanged =
        JSON.stringify(nextOptions) !== JSON.stringify(rawOptions);
      if (!cancelled && (localTextChanged || localOptionsChanged)) {
        onUpdateEditRef.current({
          questionText: nextQuestionText,
          options: nextOptions,
        });
      }

      try {
        const fixed = await fixQuestionGrammar(nextQuestionText, fixedOptions);
        if (cancelled) return;
        nextQuestionText = cleanRepairText(fixed.questionText ?? nextQuestionText);
        fixedOptions = cleanRepairOptions(fixed.options?.length ? fixed.options : fixedOptions);
        if (rawOptions.length) {
          nextOptions = fixedOptions;
        }
      } catch {
        // Automatic cleanup is best effort; keep the extracted text visible on failure.
      }

      if (cancelled) return;
      const textChanged = nextQuestionText.trim() !== questionText.trim();
      const optionsChanged =
        JSON.stringify(nextOptions) !== JSON.stringify(rawOptions);
      if (textChanged || optionsChanged) {
        onUpdateEditRef.current({
          questionText: nextQuestionText,
          options: nextOptions,
        });
      }
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [choicePrepNeeded, edit, entry.validIndex, question]);

  if (choicePrepNeeded) return null;

  return (
    <article className="rounded-3xl border border-slate-200 bg-sky-50/70 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <h3
          className={`min-w-0 flex-1 rounded-2xl text-lg font-semibold leading-7 text-slate-950 sm:text-xl sm:leading-8 ${
            isRtl ? "text-right" : "text-left"
          }`}
          dir={textDirection}
        >
          {settings.allowEdit && !showOriginal ? (
            <textarea
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-lg font-semibold leading-7 outline-none focus:border-slate-400 sm:text-xl sm:leading-8"
              onChange={(event) => onUpdateEdit({ questionText: event.target.value })}
              rows={3}
              value={displayQuestionText}
            />
          ) : (
            displayQuestionText || "Question text was not found."
          )}
        </h3>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {hasOriginalVariant ? (
            <button
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"
              onClick={onToggleOriginal}
              type="button"
            >
              {showOriginal ? "Show formatted" : "Show original"}
            </button>
          ) : null}
          {settings.submitMode === "manual" && !answerState && pendingSelection ? (
            <button
              className="rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white"
              onClick={onCheckAnswer}
              type="button"
            >
              Check answer
            </button>
          ) : null}
          {canViewSource ? (
            <button
              className="grid size-8 place-items-center rounded-xl bg-white text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
              onClick={() => onShowSource?.(question)}
              type="button"
              aria-label="View source"
              title="View source"
            >
              <ScanSearch className="size-3.5" aria-hidden />
            </button>
          ) : null}
          <button
            className={`grid size-8 place-items-center rounded-full transition ${
              bookmarked
                ? "bg-amber-100 text-amber-600"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
            onClick={onToggleBookmark}
            type="button"
            aria-label="Bookmark question"
          >
            <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <QuestionMedia file={file} question={question} questionIndex={entry.originalIndex} />

      <div className="mt-8 grid gap-3 rounded-2xl" dir={textDirection}>
        {options.map((option, optionIndex) => {
          const picked =
            answerState?.selected === option.label || pendingSelection === option.label;
          const verifiedChoice = trustedVerification?.choiceExplanations.find(
            (choice) => choice.label === option.label,
          );
          const isCorrectOption =
            verifiedChoice?.isCorrect ?? optionMatchesAnswer(option, correctAnswer);
          let cls =
            "w-full rounded-2xl border-2 px-5 py-4 text-base font-medium transition ";
          cls += isRtl ? "text-right " : "text-left ";

          if (!answerState && !showFeedback) {
            cls += picked
              ? "border-zinc-950 bg-slate-50 text-slate-900"
              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50/70";
          } else if (picked && answerState?.isCorrect) {
            cls += "border-green-400 bg-green-50 text-green-900";
          } else if (picked && answerState && !answerState.isCorrect) {
            cls += "border-red-400 bg-red-50 text-red-900";
          } else if (isCorrectOption) {
            cls += "border-green-300 bg-green-50/70 text-green-900";
          } else {
            cls += "border-slate-100 bg-slate-50 text-slate-400";
          }

          if (settings.allowEdit && !showOriginal) {
            return (
              <div key={`${optionIndex}-${option.label}-${option.text}`} className={cls}>
                <span className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
                  <button
                    aria-label={`Select option ${getDisplayOptionLabel(
                      option.label,
                      optionIndex,
                      isRtl,
                    )}`}
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold transition hover:bg-slate-200 disabled:opacity-60"
                    disabled={Boolean(answerState)}
                    onClick={() => onSelectOption(option)}
                    type="button"
                  >
                    {getDisplayOptionLabel(option.label, optionIndex, isRtl)}
                  </button>
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
                      onUpdateEdit({ options: nextOptions });
                    }}
                    value={option.text}
                  />
                </span>
              </div>
            );
          }

          return (
            <button
              key={`${optionIndex}-${option.label}-${option.text}`}
              aria-pressed={picked}
              className={`${cls} cursor-pointer disabled:cursor-default`}
              disabled={Boolean(answerState)}
              onClick={() => onSelectOption(option)}
              type="button"
            >
              <span className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                    picked ? "bg-zinc-950 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {getDisplayOptionLabel(option.label, optionIndex, isRtl)}
                </span>
                <span className="min-w-0 flex-1">{option.text}</span>
              </span>
            </button>
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
              {answerState.isCorrect ? <Check className="size-5" /> : <X className="size-5" />}
            </span>
            <div className="min-w-0">
              <p
                className={`text-base font-black ${
                  answerState.isCorrect ? "text-green-700" : "text-red-700"
                }`}
              >
                {answerState.isCorrect ? "Correct!" : "Incorrect"}
              </p>
              {!answerState.isCorrect && correctAnswer && !trustedVerification ? (
                <p className="mt-0.5 text-sm font-semibold text-red-600">
                  Correct answer: {correctAnswer}
                </p>
              ) : null}
              {trustedVerification ? (
                <div className="mt-3 rounded-xl border border-red-100 bg-white/80 p-3 text-sm leading-6 text-slate-700">
                  <p className="font-bold text-slate-900">
                    Verified answer: {trustedVerification.answer}
                  </p>
                  <p className="mt-1">{trustedVerification.explanation}</p>
                  <blockquote className="mt-2 border-l-2 border-red-200 pl-3 text-slate-600">
                    {trustedVerification.quote}
                  </blockquote>
                  <a
                    className="mt-2 inline-flex font-semibold text-slate-900 underline-offset-4 hover:underline"
                    href={trustedVerification.referenceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Reference: {trustedVerification.referenceLabel}
                  </a>
                </div>
              ) : null}
              {shortFeedback ? (
                <p className="mt-2 text-sm leading-6 text-slate-700">{shortFeedback}</p>
              ) : null}
              {showChoiceBreakdown ? (
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  {choiceBreakdown.map((choice, choiceIndex) => (
                    <li key={`${choiceIndex}-${choice.label}`}>
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
                  No extracted explanation or reference was found for this question.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
