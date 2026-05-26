"use client";

import { QuotaLimitBanner } from "@/components/quota-limit-banner";
import { StudyFileCard } from "@/components/pdf/study-file-card";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  getFileUpvoteCount,
  loadBookmarkedFileIds,
  loadFileUpvoteCounts,
  loadUpvotedFileIds,
  saveBookmarkedFileIds,
  saveFileUpvotes,
} from "@/lib/pdf-view-storage";
import { FileText, Plus, Search, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";

type FileListProps = {
  files: PdfFileQueueItem[];
  isReady: boolean;
  isProcessing: boolean;
  dragOver: boolean;
  uploadError: string;
  onPickFiles: () => void;
  showHeader?: boolean;
  showAddButton?: boolean;
};

export function FileList({
  files,
  isReady,
  isProcessing,
  dragOver,
  uploadError,
  onPickFiles,
  showHeader = true,
  showAddButton = true,
}: FileListProps) {
  const [fileSearch, setFileSearch] = useState("");
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [bookmarkedFileIds, setBookmarkedFileIds] = useState<Set<string>>(loadBookmarkedFileIds);
  const [upvoteCounts, setUpvoteCounts] = useState<Record<string, number>>(loadFileUpvoteCounts);
  const [upvotedFileIds, setUpvotedFileIds] = useState<Set<string>>(loadUpvotedFileIds);
  const [shareNotice, setShareNotice] = useState("");

  const filteredFiles = useMemo(() => {
    const normalized = fileSearch.trim().toLowerCase();
    const sorted = [...files].sort((a, b) => {
      const aBookmarked = bookmarkedFileIds.has(a.id) ? 1 : 0;
      const bBookmarked = bookmarkedFileIds.has(b.id) ? 1 : 0;
      if (aBookmarked !== bBookmarked) return bBookmarked - aBookmarked;
      return a.name.localeCompare(b.name);
    });

    if (!normalized) return sorted;

    return sorted.filter((file) =>
      [file.name, file.status, file.result.summary, `${file.result.mcqs.length} questions`]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [bookmarkedFileIds, fileSearch, files]);

  function toggleFileBookmark(fileId: string) {
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
    const shareText = `${file.name} · ${file.result.mcqs.length} extracted questions on DrNote`;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: file.name, text: shareText, url: shareUrl });
        return false;
      }
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setShareNotice(`Link copied for ${file.name}`);
      window.setTimeout(() => setShareNotice(""), 2500);
      return true;
    } catch {
      setShareNotice("Could not share this file");
      window.setTimeout(() => setShareNotice(""), 2500);
      return false;
    }
  }

  return (
    <div>
      {showHeader ? (
        <div className="text-center">
          <h1 className="mb-3 text-5xl font-black tracking-tight text-gray-900">
            Your library
          </h1>
          <p className="text-base text-gray-400">
            Expand a file to pick a study mode — quiz, review, flashcards, and more.
          </p>
          {showAddButton ? (
            <button
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isProcessing}
              onClick={onPickFiles}
              type="button"
            >
              <Plus className="size-4" aria-hidden />
              Add new file
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`relative mb-6 ${showHeader ? "mt-10" : "mt-0"}`}>
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          className="w-full rounded-2xl border-2 border-gray-300 bg-white py-3.5 pl-11 pr-4 text-sm text-gray-700 transition-all placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          onChange={(event) => setFileSearch(event.target.value)}
          placeholder="Search files by name or content..."
          type="text"
          value={fileSearch}
        />
        {fileSearch ? (
          <button
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
            onClick={() => setFileSearch("")}
            type="button"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <p className="mb-3 text-xs font-semibold text-gray-400">
        {isReady
          ? `${filteredFiles.length} of ${files.length} file${files.length === 1 ? "" : "s"}`
          : "Loading files…"}
        {isReady && bookmarkedFileIds.size ? ` · ${bookmarkedFileIds.size} bookmarked` : ""}
      </p>

      {uploadError ? (
        <QuotaLimitBanner className="mb-3" message={uploadError} />
      ) : null}

      {shareNotice ? (
        <p className="mb-3 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-700">
          {shareNotice}
        </p>
      ) : null}

      {!isReady ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-400">Loading your library…</p>
        </div>
      ) : files.length ? (
        <div className="flex flex-col gap-3">
          {filteredFiles.length ? (
            filteredFiles.map((file) => {
              const isBookmarked = bookmarkedFileIds.has(file.id);
              const isUpvoted = upvotedFileIds.has(file.id);
              const isExpanded = expandedFileId === file.id;

              return (
                <StudyFileCard
                  key={file.id}
                  file={file}
                  isBookmarked={isBookmarked}
                  isUpvoted={isUpvoted}
                  isExpanded={isExpanded}
                  upvoteCount={getFileUpvoteCount(file.id, upvoteCounts)}
                  onShare={() => shareFile(file)}
                  onToggleBookmark={() => toggleFileBookmark(file.id)}
                  onToggleUpvote={() => toggleFileUpvote(file.id)}
                  onToggleExpanded={() => toggleExpanded(file.id)}
                />
              );
            })
          ) : (
            <div className="rounded-2xl bg-white px-4 py-12 text-center shadow-sm">
              <Search className="mx-auto size-10 text-gray-300" aria-hidden />
              <p className="mt-3 text-sm font-bold text-gray-500">No files match your search</p>
            </div>
          )}
        </div>
      ) : (
        <button
          className={`w-full rounded-2xl border-2 border-dashed bg-white p-12 text-center shadow-sm transition-colors ${
            dragOver
              ? "border-sky-400 bg-sky-50"
              : "border-gray-200 hover:border-sky-300 hover:bg-sky-50/40"
          }`}
          onClick={onPickFiles}
          type="button"
        >
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gray-100 text-gray-400">
            {dragOver ? (
              <Upload className="size-8 text-sky-600" aria-hidden />
            ) : (
              <FileText className="size-8" aria-hidden />
            )}
          </div>
          <h2 className="mt-4 text-xl font-black text-gray-900">
            {dragOver ? "Drop to upload" : "No processed files found"}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Drop a PDF here or click to browse — questions extract automatically
          </p>
        </button>
      )}
    </div>
  );
}
