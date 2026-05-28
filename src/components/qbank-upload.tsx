"use client";

import {
  ArrowRight,
  ChevronLeft,
  FileText,
  Link as LinkIcon,
  Type,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { QuotaLimitBanner } from "@/components/quota-limit-banner";
import {
  filterSupportedUploadFiles,
  processPdfUploads,
} from "@/lib/process-pdf-upload";
import { UPLOAD_ACCEPT_ATTRIBUTE } from "@/lib/upload-file-types";
import {
  getUploadProgressDetail,
  getUploadProgressLabel,
  getUploadProgressPercent,
} from "@/lib/upload-progress";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

interface UploadedFile {
  id: string;
  file: File;
  progress: number;
  done: boolean;
  statusLabel?: string;
  detail?: string;
  safeToLeave?: boolean;
  error?: string;
}

interface TextEntry {
  id: number;
  content: string;
  label: string;
}

export type QBankUploadSnapshot = {
  files: UploadedFile[];
  textEntries: TextEntry[];
  totalItems: number;
  allFilesReady: boolean;
  isProcessing: boolean;
  safeToLeave: boolean;
  hasErrors: boolean;
  errorMessage?: string;
};

type QBankUploadProps = {
  variant?: "home" | "dashboard";
  showContinueLink?: boolean;
  onChange?: (snapshot: QBankUploadSnapshot) => void;
};

let idCounter = 0;

function textContentToFile(content: string): File {
  const isLink = /^https?:\/\//i.test(content);
  const name = isLink ? "pasted-url.txt" : "pasted-text.txt";
  const blob = new Blob([content], { type: "text/plain" });
  return new File([blob], name, { type: "text/plain" });
}

export function QBankUpload({
  variant = "home",
  showContinueLink = true,
  onChange,
}: QBankUploadProps) {
  const isDashboard = variant === "dashboard";
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [linkValue, setLinkValue] = useState("");
  const [textEntries, setTextEntries] = useState<TextEntry[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const totalItems = uploadedFiles.length + textEntries.length;
  const isProcessing = uploadedFiles.some((item) => !item.done && !item.error);
  const safeToLeave = uploadedFiles.some(
    (item) => item.safeToLeave && !item.done && !item.error,
  );
  const hasErrors =
    Boolean(globalError) || uploadedFiles.some((item) => Boolean(item.error));
  const allFilesReady =
    uploadedFiles.length > 0 &&
    uploadedFiles.every((item) => item.done || Boolean(item.error)) &&
    !isProcessing;
  const canContinue =
    totalItems > 0 && (allFilesReady || safeToLeave) && !hasErrors;

  useEffect(() => {
    onChange?.({
      files: uploadedFiles,
      textEntries,
      totalItems,
      allFilesReady,
      isProcessing,
      safeToLeave,
      hasErrors,
      errorMessage: globalError || uploadedFiles.find((item) => item.error)?.error,
    });
  }, [
    uploadedFiles,
    textEntries,
    totalItems,
    allFilesReady,
    isProcessing,
    safeToLeave,
    hasErrors,
    globalError,
    onChange,
  ]);

  const shellClass = isDashboard
    ? "relative w-full rounded-3xl border-2 border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6"
    : "relative mx-auto w-full max-w-[590px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70 sm:p-5";

  const dropZoneClass = isDashboard
    ? isDragging
      ? "border-blue-500 bg-blue-50"
      : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40"
    : isDragging
      ? "border-emerald-500 bg-emerald-50 shadow-[inset_0_0_0_4px_rgba(16,185,129,0.12)]"
      : "border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-white";

  const addBtnClass = isDashboard
    ? "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
    : "rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800";

  const sourcesTabClass = isDashboard
    ? "absolute top-5 -right-px flex items-center gap-1.5 rounded-l-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
    : "absolute top-5 -right-px flex items-center gap-1.5 rounded-l-xl border border-r-0 border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50";

  const inputWrapClass = isDashboard
    ? "mt-4 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 transition-colors focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10"
    : "mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10";

  async function uploadFile(entry: UploadedFile) {
    setGlobalError("");
    setUploadedFiles((prev) =>
      prev.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              progress: 8,
              done: false,
              statusLabel: "Checking file",
              detail: "Preparing the upload receipt.",
              safeToLeave: false,
              error: undefined,
            }
          : item,
      ),
    );

    try {
      await processPdfUploads([entry.file], {
        append: true,
        onJobStarted: (record) => {
          setUploadedFiles((prev) =>
            prev.map((item) =>
              item.id === entry.id
                ? {
                    ...item,
                    progress: getUploadProgressPercent(record),
                    done: false,
                    statusLabel: getUploadProgressLabel(record),
                    detail: getUploadProgressDetail(record),
                    safeToLeave: true,
                    error: undefined,
                  }
                : item,
            ),
          );
        },
      });
      setUploadedFiles((prev) =>
        prev.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                progress: 100,
                done: true,
                statusLabel: "Ready to study",
                detail: "Open the dashboard to quiz, review, or run exam mode.",
                safeToLeave: false,
                error: undefined,
              }
            : item,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "File extraction failed.";
      setGlobalError(message);
      setUploadedFiles((prev) =>
        prev.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                progress: 100,
                done: false,
                statusLabel: "Upload failed",
                detail: "Fix the issue and retry this file.",
                safeToLeave: false,
                error: message,
              }
            : item,
        ),
      );
    }
  }

  function queueFile(file: File) {
    const entry: UploadedFile = {
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      progress: 0,
      done: false,
      statusLabel: "Waiting to start",
      detail: "File accepted by the browser.",
    };
    setUploadedFiles((prev) => [...prev, entry]);
    void uploadFile(entry);
  }

  function addFiles(newFiles: File[]) {
    const supported = filterSupportedUploadFiles(newFiles);
    if (!supported.length) {
      setGlobalError("Choose at least one supported file to upload.");
      return;
    }
    setGlobalError("");
    supported.forEach((file) => queueFile(file));
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  function removeFile(fileId: string) {
    setUploadedFiles((prev) => prev.filter((item) => item.id !== fileId));
    setGlobalError("");
  }

  function submitInput() {
    const value = linkValue.trim();
    if (!value) return;

    const isLink = value.startsWith("http://") || value.startsWith("https://");
    const label = isLink
      ? (() => {
          try {
            return new URL(value).hostname;
          } catch {
            return value.slice(0, 40);
          }
        })()
      : value.slice(0, 50) + (value.length > 50 ? "…" : "");

    idCounter += 1;
    setTextEntries((prev) => [...prev, { id: idCounter, content: value, label }]);
    setLinkValue("");
    queueFile(textContentToFile(value));
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitInput();
    }
  }

  function removeEntry(id: number) {
    setTextEntries((prev) => prev.filter((entry) => entry.id !== id));
  }

  return (
    <div className="relative w-full font-[family-name:var(--font-dm-sans)]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {sidebarOpen ? (
        <div className="fixed top-0 right-0 z-50 flex h-full w-80 flex-col border-l-2 border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <span className="text-sm font-bold text-gray-800">
            Sources
            <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
              {totalItems}
            </span>
          </span>
          <button
            aria-label="Close sources sidebar"
            className="text-gray-400 transition-colors hover:text-gray-700"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {uploadedFiles.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 pt-3 pb-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="shrink-0 text-gray-400" size={13} />
                  <span className="truncate text-xs font-medium text-gray-700">
                    {item.file.name}
                  </span>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span className="font-mono text-xs text-gray-400">
                    {item.done ? "Ready" : item.error ? "Failed" : `${item.progress}%`}
                  </span>
                  <button
                    aria-label={`Remove ${item.file.name}`}
                    className="text-gray-300 transition-colors hover:text-red-400"
                    onClick={() => removeFile(item.id)}
                    type="button"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              {item.error ? (
                <div className="mb-2">
                  <QuotaLimitBanner compact message={item.error} />
                </div>
              ) : null}
              <div className="mb-2">
                <p className="text-xs font-semibold text-gray-700">
                  {item.statusLabel ??
                    (item.done ? "Ready to study" : "Preparing upload")}
                </p>
                {item.detail ? (
                  <p className="mt-0.5 text-xs leading-4 text-gray-400">
                    {item.detail}
                  </p>
                ) : null}
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    item.error
                      ? "bg-red-400"
                      : item.done
                        ? isDashboard
                          ? "bg-blue-500"
                          : "bg-emerald-400"
                        : isDashboard
                          ? "bg-blue-400"
                          : "bg-gray-700"
                  }`}
                  style={{ width: `${item.done ? 100 : item.progress}%` }}
                />
              </div>
            </div>
          ))}

          {textEntries.map((entry) => {
            const isLink =
              entry.content.startsWith("http://") ||
              entry.content.startsWith("https://");
            return (
              <div
                className="flex items-start justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
                key={entry.id}
              >
                <div className="flex min-w-0 items-start gap-2">
                  {isLink ? (
                    <LinkIcon
                      className="mt-0.5 shrink-0 text-gray-400"
                      size={13}
                    />
                  ) : (
                    <Type className="mt-0.5 shrink-0 text-gray-400" size={13} />
                  )}
                  <span className="text-xs leading-relaxed break-all text-gray-700">
                    {entry.label}
                  </span>
                </div>
                <button
                  aria-label={`Remove ${entry.label}`}
                  className="shrink-0 text-gray-300 transition-colors hover:text-red-400"
                  onClick={() => removeEntry(entry.id)}
                  type="button"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}

          {totalItems === 0 && (
            <p className="mt-8 text-center text-xs text-gray-300">
              No sources added yet
            </p>
          )}
        </div>
        </div>
      ) : null}

      <div className={shellClass}>
        {totalItems > 0 && (
          <button
            className={sourcesTabClass}
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <ChevronLeft size={13} />
            Sources
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-xs leading-none font-bold ${
                isDashboard
                  ? "bg-white text-blue-700"
                  : "bg-white text-gray-900"
              }`}
            >
              {totalItems}
            </span>
          </button>
        )}

        {!isDashboard ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 font-[family-name:var(--font-dm-sans)]">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
                <Upload className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-bold text-slate-950">
                Upload sources
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1.5">
                PDF
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">
                images
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">
                text
              </span>
            </div>
          </div>
        ) : null}

        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition-all duration-200 ${
            isDashboard ? "py-10" : "min-h-[220px] py-8 sm:min-h-[250px] sm:py-10"
          } ${dropZoneClass}`}
          onClick={() => fileInputRef.current?.click()}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <input
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            className="hidden"
            multiple
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          <div
            className={`mb-4 flex items-center justify-center rounded-2xl border ${
              isDashboard
                ? "h-12 w-12 border-blue-100 bg-blue-50"
                : "h-14 w-14 border border-slate-200 bg-white shadow-sm"
            }`}
          >
            <Upload
              className={isDashboard ? "text-blue-600" : "text-emerald-600"}
              size={isDashboard ? 22 : 26}
              strokeWidth={2.4}
            />
          </div>
          <p
            className={
              isDashboard
                ? "text-base font-bold text-gray-900"
                : "font-[family-name:var(--font-sora)] text-2xl font-black leading-tight text-slate-950"
            }
          >
            {safeToLeave
              ? "Working in the background"
              : isProcessing
                ? "Checking your upload…"
              : isDashboard
                ? "Drop your files here"
                : "Drop files or click to browse"}
          </p>
          <p
            className={
              isDashboard
                ? "mt-1 text-sm text-gray-400"
                : "mt-3 max-w-md text-sm font-medium leading-6 text-slate-600"
            }
          >
            {safeToLeave
              ? "Safe to leave this page. Progress will continue."
              : "PDF, images, and text — MCQs extracted automatically"}
          </p>
          {!isDashboard ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2 font-[family-name:var(--font-dm-sans)] text-xs font-bold">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                Extract questions
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                Make flashcards
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                Start timed quiz
              </span>
            </div>
          ) : null}
        </div>

        <div className={inputWrapClass}>
          <div className="flex items-start gap-2">
            <LinkIcon
              className={`mt-1 shrink-0 ${isDashboard ? "text-blue-500" : "text-slate-400"}`}
              size={15}
            />
            <textarea
              className="flex-1 resize-none bg-transparent text-sm font-semibold leading-relaxed text-gray-900 outline-none placeholder:text-gray-500"
              onChange={(event) => setLinkValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste notes or MCQ text — press Enter to extract"
              ref={inputRef}
              rows={2}
              value={linkValue}
            />
            {linkValue.trim() ? (
              <button
                className={`mt-0.5 shrink-0 ${addBtnClass}`}
                onClick={submitInput}
                type="button"
              >
                Add
              </button>
            ) : null}
          </div>
        </div>

        {globalError ? (
          <QuotaLimitBanner className="mt-4" message={globalError} />
        ) : null}

        {showContinueLink && canContinue ? (
          <div className="mt-5 flex justify-end">
            <Link
              className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 ${
                isDashboard
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-900 hover:bg-gray-700"
              }`}
              href="/dashboard"
            >
              {safeToLeave && !allFilesReady ? "View progress" : "Continue"}
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
