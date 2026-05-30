"use client";

import { api } from "../../../convex/_generated/api";
import { QuotaLimitBanner } from "@/components/quota-limit-banner";
import { StudyFileCard } from "@/components/pdf/study-file-card";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { resumePersistedExtractionJob } from "@/lib/process-pdf-upload";
import {
  getFileAddedAt,
  getFileUpvoteCount,
  loadBookmarkedFileIds,
  loadFileUpvoteCounts,
  loadUpvotedFileIds,
  markFileDeleted,
  removeFileQueueItem,
  saveBookmarkedFileIds,
  saveFileUpvotes,
} from "@/lib/pdf-view-storage";
import {
  getUploadProgressDetail,
  getUploadProgressLabel,
  getUploadProgressPercent,
  loadUploadProgressRecords,
  removeUploadProgressRecord,
  UPLOAD_PROGRESS_UPDATED_EVENT,
  type UploadProgressRecord,
} from "@/lib/upload-progress";
import { useMutation } from "convex/react";
import { FileText, Loader2, Plus, Search, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type FileListProps = {
  files: PdfFileQueueItem[];
  isReady: boolean;
  isProcessing: boolean;
  dragOver: boolean;
  uploadError: string;
  onPickFiles: () => void;
  headerContent?: ReactNode;
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
  headerContent,
  showHeader = true,
  showAddButton = true,
}: FileListProps) {
  const [fileSearch, setFileSearch] = useState("");
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [bookmarkedFileIds, setBookmarkedFileIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [upvoteCounts, setUpvoteCounts] = useState<Record<string, number>>({});
  const [upvotedFileIds, setUpvotedFileIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [shareNotice, setShareNotice] = useState("");
  const [uploadRecords, setUploadRecords] = useState<UploadProgressRecord[]>(
    () => loadUploadProgressRecords(),
  );
  const pollingRef = useRef<Set<string>>(new Set());
  const deleteExtraction = useMutation(api.studyFiles.deleteMyExtraction);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setBookmarkedFileIds(loadBookmarkedFileIds());
      setUpvoteCounts(loadFileUpvoteCounts());
      setUpvotedFileIds(loadUpvotedFileIds());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const refresh = () => setUploadRecords(loadUploadProgressRecords());
    refresh();
    window.addEventListener(UPLOAD_PROGRESS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(UPLOAD_PROGRESS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    for (const record of uploadRecords) {
      if (
        !record.jobId ||
        record.status === "ready" ||
        record.status === "failed" ||
        pollingRef.current.has(record.id)
      ) {
        continue;
      }

      pollingRef.current.add(record.id);
      void resumePersistedExtractionJob(record, { append: true }).finally(() => {
        pollingRef.current.delete(record.id);
      });
    }
  }, [uploadRecords]);

  const filteredFiles = useMemo(() => {
    const normalized = fileSearch.trim().toLowerCase();
    const sorted = [...files].sort((a, b) => {
      const aBookmarked = bookmarkedFileIds.has(a.id) ? 1 : 0;
      const bBookmarked = bookmarkedFileIds.has(b.id) ? 1 : 0;
      if (aBookmarked !== bBookmarked) return bBookmarked - aBookmarked;
      return getFileAddedAt(b) - getFileAddedAt(a);
    });

    return sorted.filter((file) => {
      if (!normalized) return true;

      return [
        file.name,
        file.result.title,
        file.status,
        file.result.summary,
        `${file.result.mcqs.length} questions`,
      ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
    });
  }, [bookmarkedFileIds, fileSearch, files]);

  const visibleUploads = useMemo(
    () =>
      uploadRecords.filter(
        (record) => record.status !== "ready",
      ),
    [uploadRecords],
  );

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

  function deleteFile(file: PdfFileQueueItem) {
    const confirmed = window.confirm(`Delete "${file.name}" from your files?`);
    if (!confirmed) return;

    removeFileQueueItem(file.id);
    markFileDeleted(file.id);

    setBookmarkedFileIds((current) => {
      const next = new Set(current);
      next.delete(file.id);
      saveBookmarkedFileIds(next);
      return next;
    });
    setUpvotedFileIds((current) => {
      const nextUpvoted = new Set(current);
      nextUpvoted.delete(file.id);
      setUpvoteCounts((counts) => {
        const nextCounts = { ...counts };
        delete nextCounts[file.id];
        saveFileUpvotes(nextCounts, nextUpvoted);
        return nextCounts;
      });
      return nextUpvoted;
    });

    void deleteExtraction({ fileHash: file.id }).catch(() => {
      setShareNotice(`Removed ${file.name} from this device`);
      window.setTimeout(() => setShareNotice(""), 2500);
    });
  }

  const compactControls = !showHeader;

  return (
    <div>
      {headerContent ? (
        <div className="mx-auto mb-5 max-w-[820px]">{headerContent}</div>
      ) : showHeader ? (
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

      <div
        className={`mx-auto max-w-[760px] border-2 border-[#e5e5e5] bg-white p-3 shadow-[0_5px_0_#e5e5e5] ${
          compactControls ? "mb-4 rounded-[22px]" : "mb-6 mt-1 rounded-[24px]"
        }`}
      >
        <div className="relative w-full rounded-[18px] bg-[#f8fafc] transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#263238]/15">
          <span
            className={`absolute left-3 top-1/2 grid -translate-y-1/2 place-items-center rounded-2xl bg-white text-[#4b5563] shadow-sm ${
              compactControls ? "size-9" : "size-10"
            }`}
          >
            <Search className={compactControls ? "size-4" : "size-5"} aria-hidden />
          </span>
          <input
            className={`w-full border-0 bg-transparent font-black text-[#263238] outline-none transition placeholder:font-black placeholder:text-[#afafaf] ${
              compactControls
                ? "min-h-12 rounded-[18px] py-3 pl-14 pr-11 text-sm"
                : "min-h-14 rounded-[20px] py-4 pl-16 pr-12 text-base"
            }`}
            onChange={(event) => setFileSearch(event.target.value)}
            placeholder="Search files by name or content..."
            type="text"
            value={fileSearch}
          />
          {fileSearch ? (
            <button
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-[#afafaf] transition hover:bg-white hover:text-[#4b4b4b] ${
                compactControls ? "size-9" : "size-10"
              }`}
              onClick={() => setFileSearch("")}
              type="button"
            >
              <X className={compactControls ? "size-4" : "size-5"} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <p
        className={`mx-auto max-w-[760px] text-center font-bold text-[#afafaf] ${
          compactControls ? "mb-3 text-xs" : "mb-4 text-sm"
        }`}
      >
        {isReady
          ? `${filteredFiles.length} of ${files.length} file${files.length === 1 ? "" : "s"}${
              visibleUploads.length
                ? ` · ${visibleUploads.length} processing`
                : ""
            }`
          : "Loading files…"}
        {isReady && bookmarkedFileIds.size ? ` · ${bookmarkedFileIds.size} bookmarked` : ""}
      </p>

      {uploadError ? (
        <QuotaLimitBanner className="mb-3" message={uploadError} />
      ) : null}

      {shareNotice ? (
        <p className="mx-auto mb-3 max-w-[760px] rounded-2xl bg-[#f8fafc] px-4 py-3 text-center text-sm font-bold text-[#263238]">
          {shareNotice}
        </p>
      ) : null}

      {!isReady ? (
        <div className="mx-auto max-w-[820px] rounded-2xl border-2 border-[#e5e5e5] bg-white p-10 text-center shadow-[0_4px_0_#e5e5e5]">
          <p className="text-sm font-bold text-[#afafaf]">Loading your library…</p>
        </div>
      ) : files.length || visibleUploads.length ? (
        <div className="mx-auto flex max-w-[820px] flex-col gap-4">
          <button
            className="group rounded-2xl border-2 border-[#cfc8c8] border-b-4 bg-[#ebe7e7] shadow-[0_6px_0_#cfc8c8,0_14px_28px_rgba(38,50,56,0.08)] ring-4 ring-[#f5f3f3] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c3bcbc] hover:bg-[#e5e0e0] hover:shadow-[0_7px_0_#c3bcbc,0_18px_34px_rgba(38,50,56,0.11)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#d8d2d2] active:translate-y-0.5 active:shadow-[0_2px_0_#c3bcbc] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isProcessing}
            onClick={onPickFiles}
            type="button"
          >
            <div className="flex select-none items-center gap-3 px-5 py-4 text-left sm:gap-4 sm:px-6 sm:py-[18px]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-black text-[#263238] sm:text-[17px]">
                  {isProcessing ? "Extracting questions..." : "Add new course"}
                </p>
              </div>
              <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-[#cfc8c8] bg-white text-[#617086] shadow-[0_3px_0_#cfc8c8] transition group-hover:bg-[#f7f7f7] group-hover:text-[#263238] group-hover:shadow-[0_3px_0_#c3bcbc]">
                <Plus className="size-6" strokeWidth={3} aria-hidden />
              </span>
            </div>
          </button>
          {visibleUploads.map((record) => (
            <PendingUploadCard key={record.id} record={record} />
          ))}
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
                  onDelete={() => deleteFile(file)}
                  onToggleUpvote={() => toggleFileUpvote(file.id)}
                  onToggleExpanded={() => toggleExpanded(file.id)}
                />
              );
            })
          ) : files.length ? (
            <div className="rounded-2xl border-2 border-[#e5e5e5] bg-white px-4 py-12 text-center shadow-[0_4px_0_#e5e5e5]">
              <Search className="mx-auto size-10 text-[#afafaf]" aria-hidden />
              <p className="mt-3 text-sm font-black text-[#777]">
                No files match this search
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          className={`w-full rounded-2xl border-2 border-dashed bg-white p-10 text-center shadow-[0_4px_0_#e5e5e5] transition-colors ${
            dragOver
              ? "border-[#263238] bg-[#f8fafc]"
              : "border-[#e5e5e5] hover:border-[#263238] hover:bg-[#f8fafc]"
          }`}
          onClick={onPickFiles}
          type="button"
        >
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f7f7f7] text-[#afafaf]">
            {dragOver ? (
              <Upload className="size-7 text-[#263238]" aria-hidden />
            ) : (
              <FileText className="size-7" aria-hidden />
            )}
          </div>
          <h2 className="mt-4 text-lg font-black text-[#263238]">
            {dragOver ? "Drop to upload" : "No processed files found"}
          </h2>
          <p className="mt-2 text-sm font-bold text-[#777]">
            Drop a PDF here or click to browse — questions extract automatically
          </p>
        </button>
      )}
    </div>
  );
}

function PendingUploadCard({ record }: { record: UploadProgressRecord }) {
  const pct = getUploadProgressPercent(record);
  const failed = record.status === "failed";
  const interrupted = !record.jobId && !failed;

  return (
    <article className="rounded-2xl border-2 border-[#d9eafd] bg-[#f7fbff] px-4 py-3.5 shadow-[0_4px_0_#d9eafd] sm:px-5 sm:py-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#1cb0f6] shadow-sm ring-1 ring-[#d9eafd]">
          {failed || interrupted ? (
            <FileText className="size-5" aria-hidden />
          ) : (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-[#263238] sm:text-[17px]">
            {record.fileName}
          </p>
          <p className="mt-0.5 text-xs font-bold text-[#617086] sm:text-sm">
            {interrupted
              ? "Upload was interrupted"
              : failed
                ? "Needs another upload"
                : getUploadProgressLabel(record)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#8a98aa]">
            {interrupted
              ? "This tab closed before DrNote could queue the file. Upload it again to continue."
              : failed
                ? getUploadProgressDetail(record)
                : getUploadProgressDetail(record)}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[#1cb0f6] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 font-mono text-xs font-black text-[#617086]">
          {pct}%
        </span>
        {failed || interrupted ? (
          <button
            aria-label={`Dismiss ${record.fileName}`}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#8a98aa] shadow-sm ring-1 ring-[#d9eafd] transition hover:text-[#263238]"
            onClick={() => removeUploadProgressRecord(record.id)}
            type="button"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </article>
  );
}
