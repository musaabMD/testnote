"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { formatFileMeta } from "@/lib/pdf-view-storage";
import { Download, FileJson, FileText } from "lucide-react";
import { useState } from "react";

export default function FileDownloadPage() {
  return (
    <FileActionPageShell title="Download">
      {(file) => <DownloadContent file={file} />}
    </FileActionPageShell>
  );
}

function DownloadContent({ file }: { file: PdfFileQueueItem }) {
  const [notice, setNotice] = useState("");

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadOriginal() {
    const href = file.source.dataUrl || file.source.url;
    if (!href) {
      showNotice("Original file is not available in this session.");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = file.name;
    anchor.click();
    showNotice("Download started.");
  }

  function downloadQuestionsJson() {
    const payload = {
      fileName: file.name,
      summary: file.result.summary,
      questions: file.result.mcqs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    downloadBlob(`${baseName}-questions.json`, blob);
    showNotice("Questions exported as JSON.");
  }

  function downloadSummaryText() {
    const lines = [
      file.name,
      formatFileMeta(file),
      "",
      "Summary",
      file.result.summary || "No summary available.",
      "",
      `Questions (${file.result.mcqs.length})`,
      ...file.result.mcqs.map((question, index) => {
        const text =
          question.questionText ??
          question.question ??
          `Question ${index + 1}`;
        return `${index + 1}. ${text}`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    downloadBlob(`${baseName}-summary.txt`, blob);
    showNotice("Summary exported as text.");
  }

  return (
    <div className="rounded-[20px] border-[1.5px] border-[#E8E3FF] bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-black tracking-tight text-slate-950">Download</h1>
      <p className="mt-2 text-sm text-slate-500">{file.name}</p>
      <p className="mt-1 text-xs font-medium text-slate-400">{formatFileMeta(file)}</p>

      {notice ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3">
        <DownloadOption
          description="Save the uploaded PDF or image from this session."
          icon={Download}
          label="Original file"
          onClick={downloadOriginal}
        />
        <DownloadOption
          description="Export all extracted questions and metadata."
          icon={FileJson}
          label="Questions (JSON)"
          onClick={downloadQuestionsJson}
        />
        <DownloadOption
          description="Plain-text summary plus question list."
          icon={FileText}
          label="Summary (TXT)"
          onClick={downloadSummaryText}
        />
      </div>
    </div>
  );
}

function DownloadOption({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: typeof Download;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-4 rounded-xl border-[1.5px] border-[#F0F0F0] bg-[#FAFAFA] px-4 py-4 text-left transition hover:border-[#C8C4F7] hover:bg-[#F4F3FE]"
      onClick={onClick}
      type="button"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#7F77DD] shadow-sm">
        <Icon className="size-5" strokeWidth={2} aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </button>
  );
}
