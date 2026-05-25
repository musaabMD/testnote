"use client";

import { isSourceDebugAvailable } from "@/lib/source-debug";
import { reprocessSourceRegionsForFile } from "@/lib/reprocess-source-regions";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { useState } from "react";

export function SourceDevToolbar({
  file,
  onFileUpdated,
}: {
  file: PdfFileQueueItem;
  onFileUpdated: (file: PdfFileQueueItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!isSourceDebugAvailable()) return null;

  async function handleReprocess() {
    setBusy(true);
    setMessage("");
    try {
      const result = await reprocessSourceRegionsForFile(file);
      onFileUpdated(result.file);
      setMessage(
        `Reprocessed ${result.chunks.length} chunks · ${result.updatedCount} question regions updated · ${result.generatedPreviews} source page previews generated · ${result.previewFailures} preview failures`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reprocess failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-[120] max-w-xs rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-3 text-white shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-wide text-cyan-300">Source QA (dev)</p>
      <p className="mt-1 text-[11px] text-white/60">
        {file.sourceChunks?.length ?? 0} stored chunks · {file.result.mcqs.length} questions
      </p>
      <button
        className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-xl bg-cyan-500 text-xs font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50"
        disabled={busy}
        onClick={() => void handleReprocess()}
        type="button"
      >
        {busy ? "Reprocessing…" : "Reprocess source regions"}
      </button>
      {message ? <p className="mt-2 text-[11px] leading-snug text-cyan-100">{message}</p> : null}
    </div>
  );
}
