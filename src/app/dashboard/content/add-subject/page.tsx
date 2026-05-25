"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  getFileSubject,
  saveFileSubject,
} from "@/lib/pdf-view-storage";
import { loadStudyProfile } from "@/lib/study-profile";
import { useState } from "react";

const SUGGESTED_SUBJECTS = [
  "Anatomy",
  "Biochemistry",
  "Biology",
  "Chemistry",
  "Economics",
  "Math",
  "Pathology",
  "Pharmacology",
  "Physiology",
  "Physics",
];

export default function FileAddSubjectPage() {
  return (
    <FileActionPageShell title="Add Subject">
      {(file) => <AddSubjectContent key={file.id} file={file} />}
    </FileActionPageShell>
  );
}

function getInitialSubject(fileId: string) {
  return getFileSubject(fileId) || loadStudyProfile()?.examGoal?.trim() || "";
}

function AddSubjectContent({ file }: { file: PdfFileQueueItem }) {
  const [subject, setSubject] = useState(() => getInitialSubject(file.id));
  const [saved, setSaved] = useState(false);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = subject.trim();
    if (!trimmed) return;
    saveFileSubject(file.id, trimmed);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="rounded-[20px] border-[1.5px] border-[#E8E3FF] bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-black tracking-tight text-slate-950">Add Subject</h1>
      <p className="mt-2 text-sm text-slate-500">
        Organize <span className="font-semibold text-slate-700">{file.name}</span> by subject.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSave}>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Subject name
          </span>
          <input
            className="mt-2 h-12 w-full rounded-xl border border-[#EBEBEB] bg-[#FAFAFA] px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-[#C8C4F7] focus:bg-white focus:ring-2 focus:ring-[#E8E3FF]"
            onChange={(event) => setSubject(event.target.value)}
            placeholder="e.g. Pharmacology"
            value={subject}
          />
        </label>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Suggestions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_SUBJECTS.map((item) => (
              <button
                key={item}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  subject === item
                    ? "border-[#B8EDD8] bg-[#EDFAF4] text-[#1D9E75]"
                    : "border-[#F0F0F0] bg-white text-slate-600 hover:border-[#C8C4F7] hover:bg-[#F4F3FE]"
                }`}
                onClick={() => setSubject(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <button
          className="inline-flex h-11 items-center rounded-full bg-zinc-950 px-6 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:opacity-40"
          disabled={!subject.trim()}
          type="submit"
        >
          Save subject
        </button>

        {saved ? (
          <p className="text-sm font-semibold text-emerald-600">Subject saved.</p>
        ) : null}
      </form>
    </div>
  );
}
