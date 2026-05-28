"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import { StudyModePicker } from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";

export default function FileDetailPage() {
  return (
    <FileActionPageShell title="File details">
      {(file) => <FileDetailContent file={file} />}
    </FileActionPageShell>
  );
}

function FileDetailContent({ file }: { file: PdfFileQueueItem }) {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border-2 border-[#e5e5e5] bg-white shadow-[0_6px_0_#e5e5e5]">
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
