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
      className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 data-[drag-over=true]:border-indigo-400 data-[drag-over=true]:bg-indigo-700"
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
        <Plus aria-hidden className="size-4" strokeWidth={2.5} />
      )}
      {isProcessing ? "Extracting questions…" : "Add new course"}
    </button>
  );
}
