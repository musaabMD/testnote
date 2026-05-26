"use client";

import { StudyFileCard } from "@/components/pdf/study-file-card";
import { PublicHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { useStudyFiles } from "@/hooks/use-study-files";
import { useExamBySlug, useExamCatalog } from "@/hooks/use-exam-catalog";
import { CATEGORY_COLORS } from "@/lib/exams";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  filterSupportedUploadFiles,
  processPdfUploads,
} from "@/lib/process-pdf-upload";
import {
  getUnsupportedUploadReason,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "@/lib/upload-file-types";
import {
  getFileUpvoteCount,
  isLinkResource,
  loadBookmarkedFileIds,
  loadFileUpvoteCounts,
  loadUpvotedFileIds,
  saveBookmarkedFileIds,
  saveFileUpvotes,
} from "@/lib/pdf-view-storage";
import {
  addExamToLibrary,
  isExamInLibrary,
  removeExamFromLibrary,
} from "@/lib/user-exam-library";
import {
  ArrowLeft,
  Check,
  Library,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

export default function ExamLandingPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const { exam, isLoading: examLoading } = useExamBySlug(slug);
  const { exams: examOptions } = useExamCatalog();
  const libraryRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const { files: studyFiles, isLoading: filesLoading } = useStudyFiles();

  const [inLibrary, setInLibrary] = useState(() => (slug ? isExamInLibrary(slug) : false));
  const isReady = true;
  const [isProcessing, setIsProcessing] = useState(false);
  const [notice, setNotice] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [isUploadTagPickerOpen, setIsUploadTagPickerOpen] = useState(false);
  const [selectedUploadExamSlug, setSelectedUploadExamSlug] = useState(slug);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [bookmarkedFileIds, setBookmarkedFileIds] = useState<Set<string>>(loadBookmarkedFileIds);
  const [upvoteCounts, setUpvoteCounts] = useState<Record<string, number>>(loadFileUpvoteCounts);
  const [upvotedFileIds, setUpvotedFileIds] = useState<Set<string>>(loadUpvotedFileIds);

  const uploadExamOptions = useMemo(() => {
    const options = examOptions ?? [];
    if (!exam || options.some((option) => option.slug === exam.slug)) {
      return options;
    }
    return [exam, ...options];
  }, [exam, examOptions]);

  const selectedUploadExam = useMemo(
    () =>
      uploadExamOptions.find((option) => option.slug === selectedUploadExamSlug) ??
      null,
    [selectedUploadExamSlug, uploadExamOptions],
  );

  const displayFiles = useMemo(
    () => (studyFiles ?? []).filter((file) => file.examSlug === slug),
    [slug, studyFiles],
  );

  const filteredFiles = useMemo(() => {
    const normalized = fileSearch.trim().toLowerCase();
    const sorted = [...displayFiles].sort((a, b) => a.name.localeCompare(b.name));
    if (!normalized) return sorted;
    return sorted.filter((file) =>
      [file.name, file.result.summary, `${file.result.mcqs.length} questions`]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [displayFiles, fileSearch]);

  const handleUpload = useCallback(
    async (incoming: FileList | File[] | null) => {
      const incomingFiles = incoming ? Array.from(incoming) : [];
      const unsupported = incomingFiles.find((file) => getUnsupportedUploadReason(file));
      if (unsupported) {
        setNotice(getUnsupportedUploadReason(unsupported) ?? "Unsupported file type.");
        window.setTimeout(() => setNotice(""), 2500);
        return;
      }

      const supported = filterSupportedUploadFiles(incoming);
      if (!supported.length) {
        if (incoming && incoming.length > 0) {
          setNotice("Unsupported file type. Try PDF, images, text, markdown, or RTF.");
          window.setTimeout(() => setNotice(""), 2500);
        }
        return;
      }

      if (!selectedUploadExam) {
        setNotice("Choose an exam tag before uploading.");
        window.setTimeout(() => setNotice(""), 2500);
        return;
      }

      if (processingRef.current) return;
      processingRef.current = true;
      setIsProcessing(true);

      try {
        await processPdfUploads(supported, {
          append: true,
          addedBy: "You",
          examSlug: selectedUploadExam.slug,
          examName: selectedUploadExam.name,
        });
        setIsUploadTagPickerOpen(false);
        setNotice(
          supported.length === 1
            ? `${supported[0].name} uploaded to ${selectedUploadExam.name}`
            : `${supported.length} files uploaded to ${selectedUploadExam.name}`,
        );
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "File extraction failed.",
        );
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
        window.setTimeout(() => setNotice(""), 2500);
      }
    },
    [selectedUploadExam],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void handleUpload(event.target.files);
      event.target.value = "";
    },
    [handleUpload],
  );

  if (examLoading) {
    return (
      <main className="min-h-screen bg-white text-slate-950">
        <PublicHeader />
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
          <Loader2 className="size-8 animate-spin text-gray-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-gray-400">Loading exam…</p>
        </section>
      </main>
    );
  }

  if (!exam) {
    return (
      <main className="min-h-screen bg-white text-slate-950">
        <PublicHeader />
        <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
          <h1 className="text-3xl font-black text-gray-900">Exam not found</h1>
          <p className="mt-2 text-sm text-gray-500">
            This exam does not exist in our catalog.
          </p>
          <Link
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-700"
            href="/exams"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to exams
          </Link>
        </section>
      </main>
    );
  }

  const currentExam = exam;

  function handleLibraryToggle() {
    if (inLibrary) {
      removeExamFromLibrary(currentExam.slug);
      setInLibrary(false);
      setExpandedFileId(null);
      setNotice(`${currentExam.name} removed from your library`);
    } else {
      addExamToLibrary(currentExam.slug);
      setInLibrary(true);
      setNotice(`${currentExam.name} added to your library`);
    }
    window.setTimeout(() => setNotice(""), 2500);
  }

  function scrollToLibraryAction() {
    libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function requestLibraryUnlock() {
    scrollToLibraryAction();
    setNotice(`Add ${currentExam.name} to your library to unlock bookmarks and sharing`);
    window.setTimeout(() => setNotice(""), 2500);
  }

  function handleAddFilesClick() {
    setSelectedUploadExamSlug((current) => current || currentExam.slug);
    setIsUploadTagPickerOpen(true);
  }

  function handleChooseTaggedFiles() {
    if (!selectedUploadExam) {
      setNotice("Choose an exam tag before uploading.");
      window.setTimeout(() => setNotice(""), 2500);
      return;
    }
    fileInputRef.current?.click();
  }

  function toggleFileBookmark(fileId: string) {
    if (!inLibrary) return;
    setBookmarkedFileIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      saveBookmarkedFileIds(next);
      return next;
    });
  }

  function toggleFileUpvote(fileId: string) {
    const wasUpvoted = upvotedFileIds.has(fileId);
    const nextUpvoted = new Set(upvotedFileIds);
    const nextCounts = { ...upvoteCounts };
    const currentCount = nextCounts[fileId] ?? 0;
    const nextCount = wasUpvoted ? Math.max(0, currentCount - 1) : currentCount + 1;

    if (wasUpvoted) nextUpvoted.delete(fileId);
    else nextUpvoted.add(fileId);

    if (nextCount <= 0) delete nextCounts[fileId];
    else nextCounts[fileId] = nextCount;

    setUpvotedFileIds(nextUpvoted);
    setUpvoteCounts(nextCounts);
    saveFileUpvotes(nextCounts, nextUpvoted);
  }

  function toggleExpanded(fileId: string) {
    setExpandedFileId((current) => (current === fileId ? null : fileId));
  }

  async function shareFile(file: PdfFileQueueItem): Promise<boolean> {
    if (!inLibrary) return false;
    const shareText = `${file.name} · ${file.result.mcqs.length} questions on DrNote`;
    const shareUrl =
      isLinkResource(file) && file.source.url.trim()
        ? file.source.url.trim()
        : typeof window !== "undefined"
          ? window.location.href
          : "";

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: file.name, text: shareText, url: shareUrl });
        return false;
      }
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setNotice(`Link copied for ${file.name}`);
      window.setTimeout(() => setNotice(""), 2500);
      return true;
    } catch {
      setNotice("Could not share this file");
      window.setTimeout(() => setNotice(""), 2500);
      return false;
    }
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-5 shadow-sm">
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition hover:text-gray-900"
            href="/exams"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All exams
          </Link>

          <div className="mt-4 flex flex-col items-center text-center">
            <div className="grid size-11 place-items-center rounded-xl border border-gray-200 bg-white text-xl">
              {exam.country}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-gray-900">
                {exam.name}
              </h1>
              <Badge
                variant="outline"
                className={`text-xs font-semibold ${CATEGORY_COLORS[exam.category]}`}
              >
                {exam.category}
              </Badge>
            </div>
            <p className="mt-1 max-w-md text-sm text-gray-500">{exam.description}</p>
            <p className="mt-2 max-w-md text-xs font-semibold text-gray-400">
              Catalog library saves on this browser and does not require sign-in.
            </p>
          </div>

          <div
            ref={libraryRef}
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            <button
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                inLibrary
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-gray-900 text-white hover:bg-gray-700"
              }`}
              disabled={!isReady}
              onClick={handleLibraryToggle}
              type="button"
            >
              {inLibrary ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Library className="size-3.5" aria-hidden />
              )}
              {inLibrary ? "In library" : "Add to library"}
            </button>

            {inLibrary ? (
              <Link
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-gray-300 hover:text-gray-900"
                href="/dashboard"
              >
                Open library
              </Link>
            ) : null}

            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isReady || isProcessing}
              onClick={handleAddFilesClick}
              type="button"
            >
              {isProcessing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-3.5" aria-hidden />
              )}
              Upload files
            </button>
          </div>

          {isUploadTagPickerOpen ? (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm">
              <label
                className="text-xs font-bold uppercase tracking-wide text-gray-400"
                htmlFor="exam-upload-tag"
              >
                Exam tag
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <select
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none transition focus:border-gray-400"
                  id="exam-upload-tag"
                  onChange={(event) =>
                    setSelectedUploadExamSlug(event.target.value)
                  }
                  value={selectedUploadExamSlug}
                >
                  <option value="">Select an exam</option>
                  {uploadExamOptions.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!selectedUploadExam || isProcessing}
                  onClick={handleChooseTaggedFiles}
                  type="button"
                >
                  {isProcessing ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-3.5" aria-hidden />
                  )}
                  Choose files
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Files only appear on pages that match their selected exam tag.
              </p>
            </div>
          ) : null}

          {notice ? (
            <p className="mt-3 text-center text-xs font-bold text-emerald-700">
              {notice}
            </p>
          ) : null}

          {displayFiles.length > 0 ? (
            <div className="relative mt-4">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm text-gray-700 transition placeholder:text-gray-400 focus:border-gray-300 focus:outline-none"
                onChange={(event) => setFileSearch(event.target.value)}
                placeholder="Search files by name..."
                type="text"
                value={fileSearch}
              />
              {fileSearch ? (
                <button
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => setFileSearch("")}
                  type="button"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <input
          accept={UPLOAD_ACCEPT_ATTRIBUTE}
          className="hidden"
          multiple
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />

        <div className="mt-4">
          {filesLoading ? (
            <div className="rounded-2xl bg-white px-4 py-12 text-center shadow-sm">
              <Loader2 className="mx-auto size-8 animate-spin text-gray-300" aria-hidden />
              <p className="mt-3 text-sm font-bold text-gray-500">Loading your files…</p>
            </div>
          ) : filteredFiles.length ? (
            <div className="flex flex-col gap-3">
              {filteredFiles.map((file) => (
                <StudyFileCard
                  key={file.id}
                  file={file}
                  isBookmarked={bookmarkedFileIds.has(file.id)}
                  isUpvoted={upvotedFileIds.has(file.id)}
                  isExpanded={expandedFileId === file.id}
                  upvoteCount={getFileUpvoteCount(file.id, upvoteCounts)}
                  locked={!inLibrary}
                  onRequestUnlock={requestLibraryUnlock}
                  onShare={() => shareFile(file)}
                  onToggleBookmark={() => toggleFileBookmark(file.id)}
                  onToggleUpvote={() => toggleFileUpvote(file.id)}
                  onToggleExpanded={() => toggleExpanded(file.id)}
                />
              ))}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_55%,#ecfeff_100%)] px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div
                className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a,#0891b2,#10b981)]"
                aria-hidden
              />
              <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-cyan-100 bg-white text-cyan-700 shadow-sm">
                <Upload className="size-7" strokeWidth={1.8} aria-hidden />
              </div>
              <p className="mt-5 text-base font-black tracking-tight text-gray-900">
                No {currentExam.name} files yet
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">
                Upload study materials tagged to this exam to extract questions and start studying.
              </p>
              <button
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isProcessing}
                onClick={handleAddFilesClick}
                type="button"
              >
                {isProcessing ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-3.5" aria-hidden />
                )}
                Upload your first file
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
