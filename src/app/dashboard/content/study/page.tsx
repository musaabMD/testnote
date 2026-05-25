"use client";

import {
  SourceImageDialog,
  type SourcePreview,
} from "@/components/pdf/pdf-view-modals";
import {
  PdfStudyPanel,
  getOptions,
  getQuestionText,
  studyModeHref,
  type QuestionAnswer,
  type StudyMode,
} from "@/components/pdf/pdf-study-panel";
import { useStudyFile } from "@/hooks/use-study-files";
import { getSourcePreview, normalizeSourceRegion } from "@/lib/highlightable-source";
import { resolveSourceFileForViewing } from "@/lib/resolve-source-file";
import { convex } from "@/lib/convex-client";
import { getRawQuestionText } from "@/lib/question-text";
import { SourceDevToolbar } from "@/components/pdf/source-dev-toolbar";
import { saveFileQueueItem } from "@/lib/pdf-view-storage";
import { StudySessionChromeProvider } from "@/components/pdf/study-session-chrome";
import {
  loadQuestionBookmarks,
  loadQuizAnswers,
  PDF_QUESTION_BOOKMARKS_KEY,
  PDF_QUIZ_ANSWERS_KEY,
} from "@/lib/pdf-view-storage";
import type { PdfMcq } from "@/lib/pdf-mcqs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";

const STUDY_MODES: StudyMode[] = [
  "flashcards",
  "quiz",
  "review",
  "exam",
  "summary",
  "ask",
];

function parseMode(value: string | null): StudyMode {
  if (value && STUDY_MODES.includes(value as StudyMode)) {
    return value as StudyMode;
  }
  return "quiz";
}

export default function PdfStudyPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-white text-sm font-semibold text-slate-400">
          Loading study session…
        </main>
      }
    >
      <PdfStudyPageContent />
    </Suspense>
  );
}

function PdfStudyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileId = searchParams.get("file") ?? "";
  const mode = parseMode(searchParams.get("mode"));

  const { file, isLoading } = useStudyFile(fileId);
  const [questionBookmarks, setQuestionBookmarks] = useState<Record<string, string[]>>(
    loadQuestionBookmarks,
  );
  const [quizAnswers, setQuizAnswers] = useState<
    Record<string, Record<string, QuestionAnswer>>
  >(loadQuizAnswers);
  const [sourcePreview, setSourcePreview] = useState<SourcePreview | null>(null);
  const [sourcePreviewError, setSourcePreviewError] = useState("");

  /* Quit dialog */
  const [quitDialog, setQuitDialog] = useState<string | null>(null); // pending nav url
  /* Guard navigation during active quiz */
  function handleNavAttempt(url: string) {
    if ((mode === "quiz" || mode === "exam") && file) {
      const answered = Object.keys(quizAnswers[file.id] ?? {}).length;
      const total = file.result.mcqs.length;
      if (answered > 0 && answered < total) {
        setQuitDialog(url);
        return;
      }
    }
    router.push(url);
  }

  function toggleQuestionBookmark(questionId: string) {
    if (!file) return;
    setQuestionBookmarks((current) => {
      const fileMarks = new Set(current[file.id] ?? []);
      if (fileMarks.has(questionId)) fileMarks.delete(questionId);
      else fileMarks.add(questionId);
      const next = { ...current, [file.id]: [...fileMarks] };
      window.localStorage.setItem(PDF_QUESTION_BOOKMARKS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function recordAnswer(questionId: string, answer: QuestionAnswer) {
    if (!file) return;
    setQuizAnswers((current) => {
      const next = {
        ...current,
        [file.id]: { ...(current[file.id] ?? {}), [questionId]: answer },
      };
      window.localStorage.setItem(PDF_QUIZ_ANSWERS_KEY, JSON.stringify(next));
      return next;
    });
  }

  const openQuestionSource = useCallback(
    async (question: PdfMcq) => {
      if (!file) return;
      setSourcePreviewError("");

      const basePreview = getSourcePreview(file.source);
      const resolved = await resolveSourceFileForViewing(file.id, file.source, { convex });
      if (!resolved) {
        setSourcePreviewError(
          "Source file is not available. Re-upload the file to view highlights.",
        );
        return;
      }

      const questionId =
        question.questionId ??
        `${file.id}:q:${question.questionNumber ?? question.sourceChunkIds?.[0] ?? "unknown"}`;

      setSourcePreview({
        fileId: file.id,
        questionId,
        source: resolved.source,
        previewUrl: resolved.url,
        previewMimeType: basePreview.previewMimeType,
        pageNumber: question.sourcePage ?? question.sourceRegion?.pageNumber ?? 1,
        questionText: getRawQuestionText(question) || getQuestionText(question),
        questionNumber: question.questionNumber,
        optionTexts: getOptions(question).map((option) => option.text),
        sourceChunkIds: question.sourceChunkIds,
        sourceRegion: normalizeSourceRegion(
          question.sourceRegion as Parameters<typeof normalizeSourceRegion>[0],
          question.sourcePage ?? question.sourceRegion?.pageNumber ?? 1,
        ),
        sourceChunks: file.sourceChunks,
      });
    },
    [file],
  );

  /* Remaining questions count for quit dialog */
  const remainingCount = useMemo(() => {
    if (!file) return 0;
    const answered = Object.keys(quizAnswers[file.id] ?? {}).length;
    return Math.max(0, file.result.mcqs.length - answered);
  }, [file, quizAnswers]);

  return (
    <StudySessionChromeProvider onBack={() => handleNavAttempt("/dashboard")}>
      <main
        className={`flex min-h-screen flex-col text-slate-950 ${
          mode === "exam" ? "bg-slate-100" : "bg-white"
        }`}
      >
        {isLoading ? (
          <section className="mx-auto max-w-[1180px] px-4 py-8">
            <div className="rounded-3xl bg-slate-50 p-10 text-center">
              <p className="text-sm font-semibold text-slate-400">Loading study session…</p>
            </div>
          </section>
        ) : !file ? (
          <section className="mx-auto max-w-[1180px] px-4 py-8">
            <div className="rounded-3xl bg-slate-50 p-12 text-center">
              <h1 className="text-xl font-black text-slate-950">File not found</h1>
              <p className="mt-2 text-sm text-slate-500">
                This file was not found in your account. Upload it again to continue studying.
              </p>
              <Link
                className="mt-6 inline-flex h-12 items-center rounded-full bg-zinc-950 px-8 text-sm font-bold text-white transition hover:bg-zinc-800"
                href="/dashboard"
              >
                Upload files
              </Link>
            </div>
          </section>
        ) : (
          <>
            <PdfStudyPanel
              bookmarkedQuestionIds={new Set(questionBookmarks[file.id] ?? [])}
              file={file}
              layout="full"
              mode={mode}
              onModeChange={(nextMode) => router.push(studyModeHref(file.id, nextMode))}
              onRecordAnswer={recordAnswer}
              onShowQuestionSource={(question) => {
                void openQuestionSource(question);
              }}
              onToggleBookmark={toggleQuestionBookmark}
              questionAnswers={quizAnswers[file.id] ?? {}}
            />
            <SourceDevToolbar
              file={file}
              onFileUpdated={(nextFile) => {
                saveFileQueueItem(nextFile);
              }}
            />
          </>
        )}

      {/* Source image dialog */}
      {sourcePreviewError ? (
        <div className="fixed inset-x-4 bottom-4 z-[260] mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-lg">
          {sourcePreviewError}
        </div>
      ) : null}

      {sourcePreview ? (
        <SourceImageDialog
          fileId={sourcePreview.fileId}
          imageUrl={sourcePreview.imageUrl}
          onClose={() => setSourcePreview(null)}
          pageNumber={sourcePreview.pageNumber}
          previewMimeType={sourcePreview.previewMimeType}
          previewUrl={sourcePreview.previewUrl}
          questionNumber={sourcePreview.questionNumber}
          optionTexts={sourcePreview.optionTexts}
          questionText={sourcePreview.questionText}
          source={sourcePreview.source}
          sourceChunks={sourcePreview.sourceChunks}
          sourceChunkIds={sourcePreview.sourceChunkIds}
          sourceRegion={sourcePreview.sourceRegion}
          questionId={sourcePreview.questionId}
        />
      ) : null}

      {/* Quit confirmation dialog */}
      {quitDialog ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            style={{ animation: "slideUp 0.25s ease" }}
          >
            <h2 className="text-xl font-black text-slate-950">Leave session?</h2>
            <p className="mt-2 text-sm text-slate-500">
              You have <span className="font-bold text-slate-800">{remainingCount} question{remainingCount === 1 ? "" : "s"}</span> remaining.
              Your progress is saved automatically.
            </p>
            <div className="mt-5 grid gap-2">
              <button
                className="flex h-12 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-bold text-white transition hover:bg-zinc-800"
                onClick={() => setQuitDialog(null)}
                type="button"
              >
                Keep studying
              </button>
              <button
                className="flex h-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
                onClick={() => {
                  setQuitDialog(null);
                  router.push(quitDialog);
                }}
                type="button"
              >
                Continue later (progress saved)
              </button>
              <button
                className="flex h-12 items-center justify-center rounded-2xl text-sm font-bold text-red-500 transition hover:bg-red-50"
                onClick={() => {
                  setQuitDialog(null);
                  router.push(quitDialog);
                }}
                type="button"
              >
                Quit anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </main>
    </StudySessionChromeProvider>
  );
}
