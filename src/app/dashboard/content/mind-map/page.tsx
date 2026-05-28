"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import { getKeyLearning, getQuestionText } from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem, PdfMcq } from "@/lib/pdf-mcqs";
import { GitBranch, Sparkles } from "lucide-react";

export default function MindMapPage() {
  return (
    <FileActionPageShell title="Mind Map">
      {(file) => <MindMapContent file={file} />}
    </FileActionPageShell>
  );
}

function MindMapContent({ file }: { file: PdfFileQueueItem }) {
  const nodes = file.result.mcqs.slice(0, 8).map((question, index) => ({
    id: getQuestionId(file, question, index),
    title: getQuestionText(question),
    detail: getKeyLearning(question),
  }));

  return (
    <section className="rounded-[24px] border border-[#E8E3FF] bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Study structure
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Mind Map
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
            A quick concept map from the extracted questions in this file.
          </p>
        </div>
        <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <GitBranch className="size-6" aria-hidden />
        </span>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white">
          <Sparkles className="size-5 text-emerald-300" aria-hidden />
          <h2 className="mt-4 text-xl font-black">{getDisplayTitle(file)}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {file.result.summary || `${file.result.mcqs.length} extracted questions ready for review.`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {nodes.length ? (
            nodes.map((node, index) => (
              <article
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                key={node.id}
              >
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-white text-xs font-black text-emerald-700 shadow-sm">
                  {index + 1}
                </span>
                <h3 className="mt-3 line-clamp-2 text-sm font-black leading-5 text-slate-950">
                  {node.title}
                </h3>
                <p className="mt-2 line-clamp-3 text-xs font-medium leading-5 text-slate-500">
                  {node.detail}
                </p>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-400 sm:col-span-2">
              No extracted questions available for a mind map yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function getDisplayTitle(file: PdfFileQueueItem) {
  const title = file.result.title.trim();
  if (!title || title === "Extracted questions") return file.name;
  return title;
}

function getQuestionId(file: PdfFileQueueItem, question: PdfMcq, index: number) {
  return (
    question.questionId ??
    `${file.id}:mind-map:${question.questionNumber ?? index}`
  );
}
