"use client";

import { Badge } from "@/components/ui/badge";
import { CATEGORY_COLORS, type Exam } from "@/lib/exams";
import {
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  Library,
  SearchX,
} from "lucide-react";
import Link from "next/link";

type ExamCardProps = {
  exam: Exam;
  inLibrary: boolean;
  onToggleLibrary: (event: React.MouseEvent) => void;
};

export function ExamCard({ exam, inLibrary, onToggleLibrary }: ExamCardProps) {
  return (
    <article
      className={`rounded-2xl border-2 transition-all duration-200 ${
        inLibrary
          ? "border-emerald-300 bg-emerald-50/40 shadow-sm"
          : "border-gray-300 bg-white shadow-sm hover:border-gray-400 hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
        <Link
          className="group flex min-w-0 flex-1 items-center gap-3"
          href={`/exam/${exam.slug}`}
        >
          <div
            className={`grid size-11 shrink-0 place-items-center rounded-xl border text-xl leading-none sm:size-12 sm:text-2xl ${
              inLibrary
                ? "border-emerald-200 bg-white"
                : "border-gray-200 bg-gray-50"
            }`}
            aria-hidden
          >
            {exam.country}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-sm font-bold text-gray-900 group-hover:text-gray-700 sm:text-base">
                {exam.name}
              </h3>
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold ${CATEGORY_COLORS[exam.category]}`}
              >
                {exam.category}
              </Badge>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500 sm:line-clamp-1">
              {exam.description}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400">
              <FileText className="size-3" aria-hidden />
              {exam.fileCount > 0
                ? `${exam.fileCount} file${exam.fileCount === 1 ? "" : "s"}`
                : "No shared files yet"}
            </p>
          </div>

          <ChevronRight
            className="size-4 shrink-0 text-gray-300 transition group-hover:text-gray-500 sm:size-5"
            aria-hidden
          />
        </Link>

        <button
          className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition sm:px-4 sm:text-xs ${
            inLibrary
              ? "border-2 border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-gray-900 text-white hover:bg-gray-700"
          }`}
          onClick={onToggleLibrary}
          type="button"
        >
          {inLibrary ? (
            <Check className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <Library className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="hidden min-[420px]:inline">
            {inLibrary ? "Saved" : "Add to library"}
          </span>
        </button>
      </div>
    </article>
  );
}

export function ExamLibraryEmptyState({
  hasAvailableExams = true,
}: {
  hasAvailableExams?: boolean;
}) {
  const Icon = hasAvailableExams ? SearchX : BookOpen;
  const title = hasAvailableExams ? "No matching exams" : "Exam catalogs are coming soon";
  const description = hasAvailableExams
    ? "Try a different name, country, or category."
    : "We are adding exam catalogs now. When they are ready, they will appear here with study files you can save.";

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50/80 via-white to-emerald-50/60 px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-emerald-200 bg-white text-emerald-700 shadow-sm shadow-emerald-900/10">
        <Icon className="size-7" strokeWidth={1.8} aria-hidden />
      </div>
      {!hasAvailableExams ? (
        <span className="mt-5 inline-flex rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">
          Coming soon
        </span>
      ) : null}
      <p className={`${hasAvailableExams ? "mt-5" : "mt-3"} text-base font-black tracking-tight text-slate-950`}>
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
        {description}
      </p>
    </div>
  );
}
