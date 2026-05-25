"use client";

import { FileActionPageShell } from "@/components/pdf/file-action-page-shell";
import { FileSessionsList } from "@/components/pdf/file-sessions-list";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";

export default function FileSessionsPage() {
  return (
    <FileActionPageShell title="Sessions">
      {(file) => <SessionsContent file={file} />}
    </FileActionPageShell>
  );
}

function SessionsContent({ file }: { file: PdfFileQueueItem }) {
  return (
    <div className="rounded-[20px] border-[1.5px] border-[#D9E8F7] bg-[#F7FBFF] p-6 sm:p-8">
      <h1 className="text-2xl font-black tracking-tight text-slate-950">Sessions</h1>
      <p className="mt-2 text-sm text-slate-500">{file.name}</p>
      <p className="mt-1 text-xs text-slate-400">Quiz and exam attempts for this file</p>
      <div className="mt-6">
        <FileSessionsList fileId={file.id} />
      </div>
    </div>
  );
}
