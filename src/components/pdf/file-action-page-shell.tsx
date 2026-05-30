"use client";

import { useStudyFile } from "@/hooks/use-study-files";
import {
  getUploadProgressDetail,
  getUploadProgressLabel,
  getUploadProgressPercent,
  loadUploadProgressRecords,
  UPLOAD_PROGRESS_UPDATED_EVENT,
  type UploadProgressRecord,
} from "@/lib/upload-progress";
import { ArrowLeft, AlertCircle, FileText, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

import { APP_LOGO_URL, APP_NAME } from "@/lib/site-branding";

type FileActionPageShellProps = {
  title?: string;
  actions?: (file: NonNullable<ReturnType<typeof useStudyFile>["file"]>) => ReactNode;
  children: (file: NonNullable<ReturnType<typeof useStudyFile>["file"]>) => ReactNode;
};

export function FileActionPageShell({ actions, children }: FileActionPageShellProps) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-white text-sm font-semibold text-slate-400">
          Loading…
        </main>
      }
    >
      <FileActionPageShellContent actions={actions}>
        {children}
      </FileActionPageShellContent>
    </Suspense>
  );
}

function FileActionPageShellContent({
  actions,
  children,
}: FileActionPageShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileId = searchParams.get("file") ?? "";
  const jobId = searchParams.get("job") ?? "";
  const { file, isLoading } = useStudyFile(fileId);
  const [uploadRecords, setUploadRecords] = useState<UploadProgressRecord[]>(() =>
    loadUploadProgressRecords(),
  );
  const pendingRecord = useMemo(
    () =>
      uploadRecords.find(
        (record) =>
          (jobId && record.jobId === jobId) ||
          (fileId && record.fileHash === fileId),
      ) ?? null,
    [fileId, jobId, uploadRecords],
  );
  const backHref =
    pathname === "/dashboard/content" || !fileId
      ? "/dashboard"
      : `/dashboard/content?file=${encodeURIComponent(fileId)}`;

  useEffect(() => {
    const refresh = () => setUploadRecords(loadUploadProgressRecords());
    refresh();
    window.addEventListener(UPLOAD_PROGRESS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(UPLOAD_PROGRESS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-white font-[family-name:var(--font-dm-sans)] text-slate-950">
      <header className="sticky top-0 z-50 shrink-0 bg-white/95 px-4 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-[1180px] grid-cols-3 items-center">
          <Link
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
            href={backHref}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>

          <Link
            className="flex items-center justify-center gap-2 justify-self-center"
            href="/"
            aria-label="DrNote home"
          >
            <Image
              alt={APP_NAME}
              className="size-8 rounded-xl object-contain"
              height={32}
              src={APP_LOGO_URL}
              unoptimized
              width={32}
            />
          </Link>

          <div className="flex items-center justify-end">
            {file && !isLoading && actions ? actions(file) : <span aria-hidden />}
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {isLoading ? (
          <div className="rounded-[20px] border border-[#E8E3FF] bg-white p-10 text-center">
            <p className="text-sm font-semibold text-slate-400">Loading file…</p>
          </div>
        ) : !file ? (
          pendingRecord ? (
            <PendingExtractionState record={pendingRecord} />
          ) : (
            <div className="rounded-[20px] border border-[#E8E3FF] bg-white p-12 text-center">
              <h1 className="text-xl font-black text-slate-950">File not found</h1>
              <p className="mt-2 text-sm text-slate-500">
                This file was not found in your account. Upload it again to continue.
              </p>
              <Link
                className="mt-6 inline-flex h-12 items-center rounded-full bg-zinc-950 px-8 text-sm font-bold text-white transition hover:bg-zinc-800"
                href="/dashboard"
              >
                Upload files
              </Link>
            </div>
          )
        ) : (
          children(file)
        )}
      </section>
    </main>
  );
}

function PendingExtractionState({ record }: { record: UploadProgressRecord }) {
  const pct = getUploadProgressPercent(record);
  const failed = record.status === "failed";

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border-2 border-[#ded9d9] bg-[#f5f3f3] shadow-[0_6px_0_#ded9d9]">
        <div className="flex min-h-20 items-center justify-center px-5 py-5 text-center sm:min-h-24 sm:px-7 sm:py-6">
          <h1 className="max-w-3xl break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
            {record.fileName}
          </h1>
        </div>
      </section>

      <section className="rounded-[28px] border-2 border-[#e5e5e5] bg-white p-5 shadow-[0_6px_0_#e5e5e5] sm:p-6">
        <div className="flex items-start gap-4">
          <div
            className={`grid size-12 shrink-0 place-items-center rounded-2xl ${
              failed ? "bg-red-50 text-red-600" : "bg-sky-50 text-sky-700"
            }`}
          >
            {failed ? (
              <AlertCircle className="size-6" aria-hidden />
            ) : record.status === "uploading" ? (
              <FileText className="size-6" aria-hidden />
            ) : (
              <Loader2 className="size-6 animate-spin" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-black ${
                failed ? "text-red-600" : "text-slate-950"
              }`}
            >
              {failed ? "Extraction failed" : getUploadProgressLabel(record)}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {getUploadProgressDetail(record)}
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  failed ? "bg-red-500" : "bg-sky-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
              <span>{pct}%</span>
              <span>
                {failed ? "Try uploading again" : "You can leave and come back later"}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
