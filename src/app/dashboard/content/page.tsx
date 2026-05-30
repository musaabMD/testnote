"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import { StudyModePicker } from "@/components/pdf/pdf-study-panel";
import {
  markFileDeleted,
  removeFileQueueItem,
} from "@/lib/pdf-view-storage";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { api } from "../../../../convex/_generated/api";
import { useMutation } from "convex/react";
import { Link2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FileDetailPage() {
  return (
    <FileActionPageShell
      title="File details"
      actions={(file) => <FileDetailActions file={file} />}
    >
      {(file) => <FileDetailContent file={file} />}
    </FileActionPageShell>
  );
}

function FileDetailActions({ file }: { file: PdfFileQueueItem }) {
  const router = useRouter();
  const deleteExtraction = useMutation(api.studyFiles.deleteMyExtraction);
  const [notice, setNotice] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function shareFile() {
    const shareText = `${file.name} · ${file.result.mcqs.length} extracted questions on DrNote`;
    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: file.name, text: shareText, url: shareUrl });
        return;
      }

      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setNotice("Link copied");
    } catch {
      setNotice("Could not share this file");
    }

    window.setTimeout(() => setNotice(""), 2500);
  }

  function deleteFile() {
    const confirmed = window.confirm(`Delete "${file.name}" from your files?`);
    if (!confirmed) return;

    setIsDeleting(true);
    removeFileQueueItem(file.id);
    markFileDeleted(file.id);
    router.replace("/dashboard");

    void deleteExtraction({ fileHash: file.id }).catch(() => {});
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {notice ? (
        <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 sm:inline-flex">
          {notice}
        </span>
      ) : null}
      <button
        aria-label={`Share ${file.name}`}
        className="grid size-10 place-items-center rounded-full border border-sky-100 bg-sky-50 text-sky-700 transition hover:border-sky-200 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
        onClick={() => void shareFile()}
        title="Share"
        type="button"
      >
        <Link2 className="size-4" strokeWidth={2.4} aria-hidden />
      </button>
      <button
        aria-label={`Delete ${file.name}`}
        className="grid size-10 place-items-center rounded-full border border-red-100 bg-red-50 text-red-600 transition hover:border-red-200 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isDeleting}
        onClick={deleteFile}
        title="Delete"
        type="button"
      >
        <Trash2 className="size-4" strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}

function FileDetailContent({ file }: { file: PdfFileQueueItem }) {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border-2 border-[#ded9d9] bg-[#f5f3f3] shadow-[0_6px_0_#ded9d9]">
        <div className="flex min-h-20 items-center justify-center px-5 py-5 text-center sm:min-h-24 sm:px-7 sm:py-6">
          <h1 className="max-w-3xl break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
            {file.name}
          </h1>
        </div>
      </section>

      <section className="rounded-[28px] border-2 border-[#e5e5e5] bg-[#f7f7f7] p-3 shadow-[0_6px_0_#e5e5e5] sm:p-4">
        <StudyModePicker fileId={file.id} />
      </section>
    </div>
  );
}
