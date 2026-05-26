"use client";

import { StudyModePicker } from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  formatAddedDate,
  getFileAddedAt,
  getFileAddedBy,
  isLinkResource,
} from "@/lib/pdf-view-storage";
import {
  Bookmark,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  Link2,
  User,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type StudyFileCardProps = {
  file: PdfFileQueueItem;
  isBookmarked: boolean;
  isUpvoted: boolean;
  upvoteCount: number;
  isExpanded: boolean;
  onToggleBookmark: () => void;
  onToggleUpvote: () => void;
  onToggleExpanded: () => void;
  onShare: () => Promise<boolean>;
  locked?: boolean;
  onRequestUnlock?: () => void;
};

export function StudyFileCard({
  file,
  isBookmarked,
  isUpvoted,
  upvoteCount,
  isExpanded,
  onToggleBookmark,
  onToggleUpvote,
  onToggleExpanded,
  onShare,
  locked = false,
  onRequestUnlock,
}: StudyFileCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;

    function handleClick(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        onToggleExpanded();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isExpanded, onToggleExpanded]);

  const added = formatAddedDate(getFileAddedAt(file));
  const addedBy = getFileAddedBy(file);
  const isLink = isLinkResource(file);
  const displayTitle = getAiFileTitle(file);
  const showOriginalFileName = displayTitle !== file.name;

  async function handleShareClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (locked) {
      if (!isExpanded) onToggleExpanded();
      onRequestUnlock?.();
      return;
    }
    const didCopy = await onShare();
    if (!didCopy) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function handleBookmarkClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (locked) {
      if (!isExpanded) onToggleExpanded();
      onRequestUnlock?.();
      return;
    }
    onToggleBookmark();
  }

  return (
    <article
      ref={cardRef}
      className={`rounded-2xl border-2 transition-all duration-200 ${
        locked
          ? "border-gray-200 bg-gray-50 shadow-sm opacity-95"
          : isExpanded
            ? "border-violet-300 bg-white shadow-lg shadow-violet-100"
            : "border-gray-200 bg-white shadow-sm hover:border-gray-300"
      }`}
    >
      <div
        className="flex cursor-pointer select-none items-center gap-2 px-3 py-3.5 sm:gap-4 sm:px-5 sm:py-4"
        onClick={() => onToggleExpanded()}
      >
        <button
          aria-label={isUpvoted ? "Remove upvote" : "Upvote file"}
          aria-pressed={isUpvoted}
          className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border-2 transition-all ${
            isUpvoted
              ? "border-violet-300 bg-violet-50 text-violet-600"
              : "border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300 hover:bg-white hover:text-gray-600"
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleUpvote();
          }}
          type="button"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
          <span className="text-[11px] font-bold leading-none">{upvoteCount}</span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900">{displayTitle}</p>
          {showOriginalFileName ? (
            <p className="mt-0.5 truncate text-xs font-medium text-gray-400">{file.name}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isLink ? <MetaChip icon={Link2} label="Link" /> : null}
            <MetaChip icon={Calendar} label={added} />
            <MetaChip icon={User} label={addedBy} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2" onClick={(event) => event.stopPropagation()}>
          <button
            aria-label={
              locked
                ? "Bookmark file — add exam to library"
                : isBookmarked
                  ? "Remove bookmark"
                  : "Bookmark file"
            }
            className={`flex size-9 items-center justify-center rounded-xl border-2 transition-all ${
              isBookmarked
                ? "border-amber-300 bg-amber-50 text-amber-500"
                : "border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50"
            }`}
            onClick={handleBookmarkClick}
            type="button"
          >
            <Bookmark className="size-4" fill={isBookmarked ? "currentColor" : "none"} aria-hidden />
          </button>

          <button
            aria-label={
              locked ? `Share ${file.name} — add exam to library` : `Share ${file.name}`
            }
            className={`relative flex size-9 items-center justify-center rounded-xl border-2 transition-all ${
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                : "border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50"
            }`}
            onClick={(event) => void handleShareClick(event)}
            type="button"
          >
            {copied ? (
              <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white">
                Copied!
              </span>
            ) : null}
            <Link2 className="size-4" aria-hidden />
          </button>

          <button
            aria-expanded={isExpanded}
            aria-label={
              locked
                ? "Add exam to library to start"
                : isExpanded
                  ? "Collapse study modes"
                  : "Expand study modes"
            }
            className={`flex size-9 items-center justify-center rounded-xl transition-all ${
              locked
                ? "bg-gray-300 text-gray-600 hover:bg-gray-400"
                : isExpanded
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "bg-gray-900 text-white hover:bg-gray-700"
            }`}
            onClick={() => onToggleExpanded()}
            type="button"
          >
            {isExpanded ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div
          className={`border-t-2 px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4 ${
            locked ? "border-gray-100 bg-gray-50" : "border-violet-100"
          }`}
        >
          {locked ? (
            <div className="relative rounded-2xl">
              <StudyModePicker fileId={file.id} preview />

              <div className="absolute inset-0 flex items-center justify-center bg-white/50 p-4">
                {onRequestUnlock ? (
                  <button
                    className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-gray-700"
                    onClick={onRequestUnlock}
                    type="button"
                  >
                    Add to library
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Choose an action
              </p>
              <StudyModePicker fileId={file.id} />
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function getAiFileTitle(file: PdfFileQueueItem) {
  const title = file.result.title.trim();
  if (!title || title === "Extracted questions") return file.name;
  return title;
}

function MetaChip({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
