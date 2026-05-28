"use client";

import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

type AddSourceCardProps = {
  onAdd: () => void;
  onAddFiles: (files: File[]) => void;
  isProcessing?: boolean;
};

export function AddSourceCard({
  onAdd,
  onAddFiles,
  isProcessing = false,
}: AddSourceCardProps) {
  const [dragOver, setDragOver] = useState(false);

  function ingestFiles(files: FileList | null) {
    if (!files?.length || isProcessing) return;
    onAddFiles(Array.from(files));
  }

  return (
    <button
      className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[#263238] border-b-4 border-b-[#111827] bg-[#263238] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#374151] active:translate-y-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:opacity-60 data-[drag-over=true]:border-[#111827] data-[drag-over=true]:bg-[#111827]"
      data-drag-over={dragOver || undefined}
      disabled={isProcessing}
      onClick={onAdd}
      onDragLeave={() => setDragOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
        ingestFiles(event.dataTransfer.files);
      }}
      type="button"
    >
      {isProcessing ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : (
        <span className="grid size-6 place-items-center rounded-full bg-white/20">
          <Plus aria-hidden className="size-4" strokeWidth={3} />
        </span>
      )}
      {isProcessing ? "Extracting questions…" : "Add new course"}
    </button>
  );
}
