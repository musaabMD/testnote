"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resumePersistedExtractionJob } from "@/lib/process-pdf-upload";
import {
  loadUploadProgressRecords,
  removeUploadProgressRecord,
  UPLOAD_PROGRESS_UPDATED_EVENT,
  type UploadProgressRecord,
} from "@/lib/upload-progress";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressPercent(record: UploadProgressRecord) {
  if (record.status === "ready") return 100;
  if (record.status === "failed") return 100;
  if (record.status === "uploading") return 8;
  if (!record.totalPages || record.totalPages <= 0) {
    return record.status === "queued" ? 18 : 45;
  }
  const pagePct =
    (Math.max(0, record.progressPagesProcessed ?? 0) / record.totalPages) * 72;
  return Math.min(95, Math.max(18, Math.round(18 + pagePct)));
}

function statusLabel(record: UploadProgressRecord) {
  if (record.status === "uploading") return "Uploading file";
  if (record.status === "queued") return "Queued for extraction";
  if (record.status === "processing") {
    if (record.totalPages) {
      return `Extracting ${record.progressPagesProcessed ?? 0}/${record.totalPages} pages`;
    }
    return "Extracting questions";
  }
  if (record.status === "finalizing") return "Saving results";
  if (record.status === "ready") return "Ready in your library";
  return "Upload failed";
}

export function UploadProgressToast() {
  const [records, setRecords] = useState<UploadProgressRecord[]>([]);
  const [now, setNow] = useState(0);
  const pollingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      setRecords(loadUploadProgressRecords());
    };
    const timeout = window.setTimeout(refresh, 0);
    window.addEventListener(UPLOAD_PROGRESS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(UPLOAD_PROGRESS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    for (const record of records) {
      if (
        !record.jobId ||
        record.status === "ready" ||
        record.status === "failed" ||
        pollingRef.current.has(record.id)
      ) {
        continue;
      }

      pollingRef.current.add(record.id);
      void resumePersistedExtractionJob(record, { append: true }).finally(() => {
        pollingRef.current.delete(record.id);
      });
    }
  }, [records]);

  const visible = useMemo(
    () =>
      records
        .filter((record) => record.status !== "ready" || now - record.updatedAt < 15000)
        .slice(0, 2),
    [now, records],
  );

  if (!visible.length) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[120] mx-auto flex max-w-md flex-col gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96">
      {visible.map((record) => {
        const isFailed = record.status === "failed";
        const isReady = record.status === "ready";
        const pct = progressPercent(record);
        return (
          <div
            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/15"
            key={record.id}
          >
            <div className="flex items-start gap-3">
              <div
                className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                  isFailed
                    ? "bg-red-50 text-red-600"
                    : isReady
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-sky-50 text-sky-700"
                }`}
              >
                {isFailed ? (
                  <AlertCircle className="size-5" aria-hidden />
                ) : isReady ? (
                  <CheckCircle2 className="size-5" aria-hidden />
                ) : record.status === "uploading" ? (
                  <FileText className="size-5" aria-hidden />
                ) : (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">
                      {record.fileName}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {statusLabel(record)} · {formatBytes(record.fileSize)}
                    </p>
                  </div>
                  <button
                    aria-label="Dismiss upload status"
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                    onClick={() => removeUploadProgressRecord(record.id)}
                    type="button"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                {record.error ? (
                  <p className="mt-2 text-xs leading-5 text-red-600">{record.error}</p>
                ) : null}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isFailed ? "bg-red-500" : isReady ? "bg-emerald-500" : "bg-sky-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
