"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import {
  fileToolHref,
  getKeyLearning,
  getNotes,
} from "@/components/pdf/pdf-study-panel";
import { useStudyFiles } from "@/hooks/use-study-files";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  formatFileMeta,
  getFileAddedAt,
  getFileSubject,
  isImageSource,
} from "@/lib/pdf-view-storage";
import {
  BookOpen,
  FileText,
  Search,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { renderPdfPagePreview } from "@/lib/pdf-document";
import {
  extractQuestionImageDataUrl,
  extractQuestionSourcePreview,
} from "@/lib/pdf-question-images";

type LibraryEntry = {
  id: string;
  file: PdfFileQueueItem;
  isCurrent: boolean;
  subject?: string;
  title: string;
  meta: string;
  text: string;
  references: string[];
};

function isReferenceUrl(text: string) {
  return /^https?:\/\//i.test(text);
}

function buildReferenceLinks(file: PdfFileQueueItem) {
  const seen = new Set<string>();
  const links: string[] = [];

  for (const question of file.result.mcqs) {
    for (const note of getNotes(question)) {
      const trimmed = note.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      links.push(trimmed);
    }
  }

  return links;
}

function buildEntryText(file: PdfFileQueueItem) {
  const summary = file.result.summary?.trim();
  if (summary) return summary;

  const highlights = file.result.mcqs
    .slice(0, 3)
    .map((question) => getKeyLearning(question))
    .filter((text) => text && !text.startsWith("No key learning extracted"))
    .join(" ");

  if (highlights) return highlights;

  return `Study material extracted from ${file.name}. Open references to quiz, flashcards, and summary modes.`;
}

function buildEntryTitle(file: PdfFileQueueItem) {
  const contentTitle = file.result.title?.trim();
  if (contentTitle && contentTitle.toLowerCase() !== "extracted questions") {
    return contentTitle;
  }

  const summary = file.result.summary?.trim();
  if (summary) {
    const firstSentence = summary.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (
      firstSentence &&
      firstSentence.length >= 10 &&
      firstSentence.length <= 120
    ) {
      return firstSentence;
    }

    if (summary.length <= 120) return summary;

    const truncated = summary.slice(0, 100);
    const lastSpace = truncated.lastIndexOf(" ");
    return `${(lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
  }

  const text = buildEntryText(file);
  if (!text.startsWith("Study material extracted from")) {
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence) return firstSentence;
  }

  return file.name;
}

function buildLibraryEntry(
  file: PdfFileQueueItem,
  currentFileId: string,
): LibraryEntry {
  return {
    id: file.id,
    file,
    isCurrent: file.id === currentFileId,
    subject: getFileSubject(file.id),
    title: buildEntryTitle(file),
    meta: formatFileMeta(file),
    text: buildEntryText(file),
    references: buildReferenceLinks(file),
  };
}

function FileSourcePreview({ file }: { file: PdfFileQueueItem }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      setPreviewUrl(null);

      const directUrl = file.source.dataUrl ?? file.source.url;
      if (isImageSource(file.source) && directUrl) {
        if (!cancelled) {
          setPreviewUrl(directUrl);
          setLoading(false);
        }
        return;
      }

      const isPdf =
        file.source.mimeType === "application/pdf" ||
        file.source.name.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        let url = await renderPdfPagePreview(file.source, file.id, 1, 2);

        if (!url) {
          const withRegion = file.result.mcqs.find((question) => question.sourceRegion);
          if (withRegion) {
            url = await extractQuestionSourcePreview(file.source, withRegion, file.id);
          }
        }

        if (!url && file.result.mcqs[0]) {
          url = await extractQuestionImageDataUrl(
            file.source,
            file.result.mcqs[0],
            file.id,
          );
        }

        if (!cancelled) {
          setPreviewUrl(url);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setLoading(false);
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <p className="text-xs font-medium text-slate-400">Loading preview…</p>
      </div>
    );
  }

  if (previewUrl) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <Image
          alt=""
          className="h-auto max-h-[360px] min-h-[280px] w-full object-contain object-top"
          height={360}
          src={previewUrl}
          unoptimized
          width={420}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-violet-50 px-4">
      <FileText className="size-12 text-violet-600" strokeWidth={1.8} aria-hidden />
      <p className="text-center text-xs font-medium text-slate-500">{file.name}</p>
    </div>
  );
}

function RefPopup({
  entry,
  onClose,
}: {
  entry: LibraryEntry;
  onClose: () => void;
}) {
  const { file, references } = entry;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">References</span>
          <button
            className="flex rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <FileSourcePreview file={file} />

        {references.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            {references.map((reference) => (
              <li key={reference}>
                {isReferenceUrl(reference) ? (
                  <a
                    className="text-sm leading-relaxed text-violet-700 underline-offset-2 hover:text-violet-900 hover:underline"
                    href={reference}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {reference}
                  </a>
                ) : (
                  <span className="text-sm leading-relaxed text-slate-600">
                    {reference}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
            No reference notes found for this file.
          </p>
        )}
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  onRefClick,
}: {
  entry: LibraryEntry;
  onRefClick: (entry: LibraryEntry) => void;
}) {
  const cardClassName = `flex gap-4 border-b border-slate-100 px-5 py-4 transition last:border-b-0 hover:bg-slate-50/80 ${
    entry.isCurrent ? "bg-violet-50/40" : "bg-white"
  }`;

  const content = (
    <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-sm font-bold text-slate-950">{entry.title}</p>
        </div>
        {entry.subject ? (
          <p className="mt-1 text-xs font-medium text-slate-600">{entry.subject}</p>
        ) : null}
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-700">
          {entry.text}
        </p>
        <button
          className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRefClick(entry);
          }}
          type="button"
        >
          <BookOpen className="size-3.5" aria-hidden />
          {entry.references.length} reference{entry.references.length === 1 ? "" : "s"}
        </button>
      </div>
  );

  return (
    <Link className={cardClassName} href={fileToolHref(entry.id, "library")}>
      {content}
    </Link>
  );
}

export default function FileLibraryPage() {
  return (
    <FileActionPageShell title="Library">
      {(file) => <LibraryContent file={file} />}
    </FileActionPageShell>
  );
}

function LibraryContent({ file }: { file: PdfFileQueueItem }) {
  const { files } = useStudyFiles();
  const [query, setQuery] = useState("");
  const [activeEntry, setActiveEntry] = useState<LibraryEntry | null>(null);

  const entries = useMemo(() => {
    const allFiles = files ?? [];
    return allFiles
      .map((item) => buildLibraryEntry(item, file.id))
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return getFileAddedAt(b.file) - getFileAddedAt(a.file);
      });
  }, [file.id, files]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return entries;

    return entries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(term) ||
        entry.text.toLowerCase().includes(term) ||
        entry.file.name.toLowerCase().includes(term) ||
        entry.meta.toLowerCase().includes(term) ||
        entry.subject?.toLowerCase().includes(term),
    );
  }, [entries, query]);

  return (
    <>
      <div className="relative mx-auto w-full overflow-hidden rounded-[20px] border-[1.5px] border-[#E8E3FF] bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-8 text-center">
          <h1 className="mb-1 flex items-center justify-center gap-2 text-2xl font-black tracking-tight text-slate-950">
            <BookOpen className="size-6 text-violet-600" aria-hidden />
            Library
          </h1>
          <p className="mb-5 text-sm text-slate-500">
            A feed of knowledge — no noise, just insight
          </p>

          <div className="relative mx-auto max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search topics, files, or subjects..."
              type="search"
              value={query}
            />
          </div>
        </div>

        <div>
          {filtered.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              No entries found for &ldquo;{query}&rdquo;
            </p>
          ) : (
            filtered.map((entry) => (
              <EntryCard
                entry={entry}
                key={entry.id}
                onRefClick={setActiveEntry}
              />
            ))
          )}
        </div>
      </div>

      {activeEntry ? (
        <RefPopup entry={activeEntry} onClose={() => setActiveEntry(null)} />
      ) : null}
    </>
  );
}
