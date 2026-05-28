"use client";

import { ExamCard, ExamLibraryEmptyState } from "@/components/exam/exam-card";
import { PublicHeader } from "@/components/site-header";
import { useExamCatalog } from "@/hooks/use-exam-catalog";
import {
  loadExamLibrary,
  toggleExamInLibrary,
} from "@/lib/user-exam-library";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export default function ExamsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [librarySlugs, setLibrarySlugs] = useState<string[]>(loadExamLibrary);
  const [notice, setNotice] = useState("");
  const { exams, categories, isLoading } = useExamCatalog({
    withFilesOnly: true,
  });

  const filteredExams = useMemo(() => {
    const source = exams ?? [];
    const normalized = searchQuery.trim().toLowerCase();
    let filtered = source;

    if (normalized) {
      filtered = filtered.filter((exam) =>
        [
          exam.name,
          exam.countryName,
          exam.description,
          exam.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter((exam) => exam.category === selectedCategory);
    }

    return filtered.sort((a, b) => {
      const aInLibrary = librarySlugs.includes(a.slug) ? 1 : 0;
      const bInLibrary = librarySlugs.includes(b.slug) ? 1 : 0;
      if (aInLibrary !== bInLibrary) return bInLibrary - aInLibrary;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
  }, [exams, librarySlugs, searchQuery, selectedCategory]);

  function handleToggleLibrary(slug: string, name: string, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const { slugs, added } = toggleExamInLibrary(slug);
    setLibrarySlugs(slugs);
    setNotice(added ? `${name} added to your library` : `${name} removed from your library`);
    window.setTimeout(() => setNotice(""), 2500);
  }

  const availableCount = exams?.length ?? 0;
  const catalogsComingSoon = !isLoading && availableCount === 0;

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-4 py-16">
        <div className="text-center">
          {catalogsComingSoon ? (
            <span className="mb-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-700">
              Coming soon
            </span>
          ) : null}
          <h1 className="mb-3 text-5xl font-black tracking-tight text-slate-950">
            Exams
          </h1>
          <p className="text-base font-medium text-slate-600">
            Browse exam catalogs, save exams to this browser, and upload study files.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Adding an exam to your catalog library is anonymous and local. Sign in only
            when you want dashboard uploads and account-backed study files.
          </p>
        </div>

        <div className="relative mb-6 mt-10">
          <Search
            className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="w-full rounded-2xl border-2 border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm font-medium text-slate-700 shadow-sm shadow-slate-950/[0.03] transition-all placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search exams by name, country, or category..."
            type="text"
            value={searchQuery}
          />
          {searchQuery ? (
            <button
              aria-label="Clear search"
              className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setSearchQuery("")}
              type="button"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-2">
          <CategoryChip
            active={selectedCategory === null}
            label="All"
            onClick={() => setSelectedCategory(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category}
              active={selectedCategory === category}
              label={category}
              onClick={() =>
                setSelectedCategory((current) =>
                  current === category ? null : category,
                )
              }
            />
          ))}
        </div>

        {notice ? (
          <p className="mb-3 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-700">
            {notice}
          </p>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center">
            <p className="text-sm font-semibold text-slate-500">Loading exams...</p>
          </div>
        ) : filteredExams.length ? (
          <div className="flex flex-col gap-3">
            {filteredExams.map((exam) => (
              <ExamCard
                key={exam.slug}
                exam={exam}
                inLibrary={librarySlugs.includes(exam.slug)}
                onToggleLibrary={(event) =>
                  handleToggleLibrary(exam.slug, exam.name, event)
                }
              />
            ))}
          </div>
        ) : (
          <ExamLibraryEmptyState hasAvailableExams={availableCount > 0} />
        )}
      </section>
    </main>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full px-4 py-2 text-xs font-bold transition ${
        active
          ? "bg-slate-950 text-white shadow-sm shadow-slate-950/15"
          : "border border-slate-200 bg-white text-slate-600 shadow-sm shadow-slate-950/[0.03] hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
