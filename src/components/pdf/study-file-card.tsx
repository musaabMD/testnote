"use client";

import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { isLinkResource } from "@/lib/pdf-view-storage";
import { ArrowUp, Bookmark, Link2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  onDelete: () => void;
  locked?: boolean;
  onRequestUnlock?: () => void;
};

export function StudyFileCard({
  file,
  isBookmarked,
  isUpvoted,
  upvoteCount,
  onToggleBookmark,
  onToggleUpvote,
  onShare,
  onDelete,
  locked = false,
  onRequestUnlock,
}: StudyFileCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const isLink = isLinkResource(file);
  const displayTitle = getAiFileTitle(file);
  const detailHref = `/dashboard/content?file=${encodeURIComponent(file.id)}`;

  function openDetails() {
    if (locked) {
      onRequestUnlock?.();
      return;
    }
    router.push(detailHref);
  }

  async function handleShareClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (locked) {
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
      onRequestUnlock?.();
      return;
    }
    onToggleBookmark();
  }

  return (
    <article
      className={`rounded-2xl border-2 transition-all duration-200 ${
        locked
          ? "border-[#e5e5e5] bg-[#f7f7f7] opacity-95 shadow-[0_4px_0_#e5e5e5]"
          : "border-[#ded9d9] bg-[#f5f3f3] shadow-[0_4px_0_#ded9d9] hover:border-[#d2cccc] hover:bg-[#efeded] hover:shadow-[0_4px_0_#d2cccc]"
      }`}
    >
      <div
        className="flex cursor-pointer select-none items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4"
        onClick={openDetails}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openDetails();
        }}
        role="button"
        tabIndex={0}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <p className="truncate text-base font-black text-[#263238] sm:text-[17px]">
              {displayTitle}
            </p>
            {isLink ? (
              <span
                aria-label="Link resource"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-[#ddf4ff] text-[#1cb0f6]"
                title="Link resource"
              >
                <Link2 className="size-3.5" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="flex shrink-0 items-center gap-1 sm:gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-label={isUpvoted ? "Remove upvote" : "Upvote file"}
            aria-pressed={isUpvoted}
            className={`inline-flex h-10 min-w-12 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-black transition-all sm:h-11 sm:min-w-14 ${
              isUpvoted
                ? "bg-[#263238] text-white shadow-[0_2px_0_#111827]"
                : "bg-transparent text-[#8a98aa] hover:bg-[#e9e7e7] hover:text-[#263238]"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              if (locked) {
                onRequestUnlock?.();
                return;
              }
              onToggleUpvote();
            }}
            type="button"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
            <span>{upvoteCount}</span>
          </button>

          <button
            aria-label={
              locked
                ? "Bookmark file — add exam to library"
                : isBookmarked
                  ? "Remove bookmark"
                  : "Bookmark file"
            }
            className={`flex size-10 items-center justify-center rounded-full transition-all sm:size-11 ${
              isBookmarked
                ? "bg-[#fff6d7] text-[#ffc800]"
                : "text-[#8a98aa] hover:bg-[#fff6d7] hover:text-[#ffc800]"
            }`}
            onClick={handleBookmarkClick}
            type="button"
          >
            <Bookmark
              className="size-5"
              fill={isBookmarked ? "currentColor" : "none"}
              aria-hidden
            />
          </button>

          <button
            aria-label={
              locked ? `Share ${file.name} — add exam to library` : `Share ${file.name}`
            }
            className={`relative flex size-10 items-center justify-center rounded-full transition-all sm:size-11 ${
              copied
                ? "bg-[#ecfdf5] text-[#059669]"
                : "text-[#afafaf] hover:bg-[#ddf4ff] hover:text-[#1cb0f6]"
            }`}
            onClick={(event) => void handleShareClick(event)}
            type="button"
          >
            {copied ? (
              <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white">
                Copied!
              </span>
            ) : null}
            <Link2 className="size-5" aria-hidden />
          </button>

          <button
            aria-label={
              locked ? "Delete unavailable — add exam to library" : `Delete ${file.name}`
            }
            className={`flex size-10 items-center justify-center rounded-full transition-all sm:size-11 ${
              locked
                ? "bg-[#e5e5e5] text-[#777] hover:bg-[#d4d4d4]"
                : "text-[#8a98aa] hover:bg-[#fee2e2] hover:text-[#dc2626]"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              if (locked) {
                onRequestUnlock?.();
                return;
              }
              onDelete();
            }}
            type="button"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}

function getAiFileTitle(file: PdfFileQueueItem) {
  const title = file.result.title.trim();
  if (!title || title === "Extracted questions") return file.name;
  return title;
}
