"use client";

import {
  ArrowRight,
  CornerDownLeft,
  File as FileIcon,
  Image as ImageIcon,
  Link2,
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
import { classifyUsageError } from "@/lib/quota-errors";
import { UPLOAD_ACCEPT_ATTRIBUTE } from "@/lib/upload-file-types";
import {
  getUploadProgressDetail,
  getUploadProgressLabel,
  getUploadProgressPercent,
  INLINE_UPLOAD_PROGRESS_OWNER_EVENT,
} from "@/lib/upload-progress";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

type SourceKind = "file" | "image" | "link" | "text";

interface UploadedFile {
  id: string;
  file: File;
  progress: number;
  done: boolean;
  sourceKind: SourceKind;
  sourceName: string;
  sourceUrl?: string;
  textEntryId?: number;
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

const TINT: Record<SourceKind, string> = {
  link: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  text: "bg-amber-50 text-amber-600 ring-amber-100",
  image: "bg-blue-50 text-blue-600 ring-blue-100",
  file: "bg-slate-100 text-slate-500 ring-slate-200",
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isURL(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function prettySize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

function textContentToFile(content: string): File {
  const name = isURL(content) ? "pasted-url.txt" : "pasted-text.txt";
  const blob = new Blob([content], { type: "text/plain" });
  return new File([blob], name, { type: "text/plain" });
}

function getFileSourceKind(file: File): SourceKind {
  return file.type.startsWith("image/") ? "image" : "file";
}

function getInputLabel(value: string) {
  if (isURL(value)) {
    try {
      return new URL(value).hostname.replace(/^www\./, "");
    } catch {
      return value.slice(0, 60);
    }
  }
  return value.length > 60 ? `${value.slice(0, 60)}...` : value;
}

function isEditablePasteTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable]"));
}

function SourceIcon({
  kind,
  className,
}: {
  kind: SourceKind;
  className?: string;
}) {
  if (kind === "link") return <Link2 className={className} />;
  if (kind === "text") return <Type className={className} />;
  if (kind === "image") return <ImageIcon className={className} />;
  return <FileIcon className={className} />;
}

function sourceMeta(source: UploadedFile) {
  if (source.error) return sourceErrorMessage(source.error);
  if (source.sourceKind === "file") {
    return `${source.file.type || "file"} · ${prettySize(source.file.size)}`;
  }
  if (source.sourceKind === "image") return `image · ${prettySize(source.file.size)}`;
  if (source.sourceKind === "link") return source.sourceUrl ?? source.file.name;
  return "pasted text";
}

function isUpgradeError(message: string) {
  const kind = classifyUsageError(message).kind;
  return kind === "plan_quota" || kind === "billing_inactive";
}

function sourceErrorMessage(message: string) {
  const classified = classifyUsageError(message);
  if (classified.kind === "plan_quota") {
    return "Upgrade required to extract questions from this file.";
  }
  if (classified.kind === "billing_inactive") {
    return "Billing needs attention before extraction can continue.";
  }
  return classified.message;
}

function SourceRow({
  source,
  onRemove,
}: {
  source: UploadedFile;
  onRemove: (id: string) => void;
}) {
  const progress = source.done ? 100 : source.progress;

  return (
    <li className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${TINT[source.sourceKind]}`}
        >
          <SourceIcon kind={source.sourceKind} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {source.sourceName}
          </p>
          <p
            className={`truncate text-xs ${
              source.error ? "text-red-500" : "text-slate-400"
            }`}
          >
            {source.statusLabel ?? sourceMeta(source)}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-slate-400">
          {source.done ? "Ready" : source.error ? "Failed" : `${progress}%`}
        </span>
        <button
          type="button"
          onClick={() => onRemove(source.id)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
          aria-label={`Remove ${source.sourceName}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {source.detail || source.error ? (
        <p
          className={`mt-2 truncate pl-12 text-xs ${
            source.error ? "text-red-500" : "text-slate-400"
          }`}
        >
          {source.error ? sourceErrorMessage(source.error) : source.detail}
        </p>
      ) : null}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
        <div
          className={`h-full rounded-full transition-all duration-200 ${
            source.error
              ? "bg-red-400"
              : source.done
                ? "bg-emerald-500"
                : "bg-blue-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </li>
  );
}

export function QBankUpload({
  variant = "home",
  showContinueLink = true,
  onChange,
}: QBankUploadProps) {
  const isDashboard = variant === "dashboard";
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [textEntries, setTextEntries] = useState<TextEntry[]>([]);
  const [globalError, setGlobalError] = useState("");
  const [flash, setFlash] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalItems = uploadedFiles.length;
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
  const visibleSources = uploadedFiles.slice(0, 3);
  const hiddenCount = uploadedFiles.length - visibleSources.length;
  const globalErrorIsUpgrade = globalError ? isUpgradeError(globalError) : false;

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

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showAll) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setShowAll(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAll]);

  useEffect(() => {
    const active = uploadedFiles.some((item) => !item.done && !item.error);
    window.dispatchEvent(
      new CustomEvent(INLINE_UPLOAD_PROGRESS_OWNER_EVENT, {
        detail: { active },
      }),
    );
  }, [uploadedFiles]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent(INLINE_UPLOAD_PROGRESS_OWNER_EVENT, {
          detail: { active: false },
        }),
      );
    };
  }, []);

  function pulseAcceptedState() {
    setFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(false), 450);
  }

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
                detail: "Fix the issue and retry this source.",
                safeToLeave: false,
                error: message,
              }
            : item,
        ),
      );
    }
  }

  const queueFile = useCallback((file: File, source?: Partial<UploadedFile>) => {
    const sourceKind = source?.sourceKind ?? getFileSourceKind(file);
    const entry: UploadedFile = {
      id: createId(),
      file,
      progress: 0,
      done: false,
      sourceKind,
      sourceName: source?.sourceName ?? (file.name || "untitled"),
      sourceUrl: source?.sourceUrl,
      textEntryId: source?.textEntryId,
      statusLabel: "Waiting to start",
      detail: "Source accepted by the browser.",
    };
    setUploadedFiles((prev) => [...prev, entry]);
    pulseAcceptedState();
    void uploadFile(entry);
  }, []);

  const addFiles = useCallback(
    (newFiles: File[] | FileList | null) => {
      const supported = filterSupportedUploadFiles(newFiles);
      if (!supported.length) {
        setGlobalError("Choose at least one supported file to upload.");
        return;
      }
      setGlobalError("");
      supported.forEach((file) => queueFile(file));
    },
    [queueFile],
  );

  const addTextOrLink = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value) return;

      const isLink = isURL(value);
      const label = getInputLabel(value);
      idCounter += 1;
      const textEntry = { id: idCounter, content: value, label };
      setTextEntries((prev) => [...prev, textEntry]);
      setGlobalError("");
      queueFile(textContentToFile(value), {
        sourceKind: isLink ? "link" : "text",
        sourceName: label,
        sourceUrl: isLink ? value : undefined,
        textEntryId: textEntry.id,
      });
    },
    [queueFile],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditablePasteTarget(event.target) ||
        isEditablePasteTarget(document.activeElement)
      ) {
        return;
      }

      const data = event.clipboardData;
      if (!data) return;

      const files = Array.from(data.files || []);
      if (files.length) {
        event.preventDefault();
        addFiles(files);
        return;
      }

      const text = data.getData("text");
      if (text) {
        event.preventDefault();
        addTextOrLink(text);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, addTextOrLink]);

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
      return;
    }

    const text = event.dataTransfer.getData("text");
    if (text) addTextOrLink(text);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  function removeFile(fileId: string) {
    const removed = uploadedFiles.find((item) => item.id === fileId);
    setUploadedFiles((prev) => prev.filter((item) => item.id !== fileId));
    if (removed?.textEntryId) {
      setTextEntries((prev) =>
        prev.filter((entry) => entry.id !== removed.textEntryId),
      );
    }
    setGlobalError("");
  }

  function submitInput() {
    addTextOrLink(inputValue);
    setInputValue("");
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitInput();
    }
  }

  const shellClass = isDashboard
    ? "relative w-full rounded-3xl bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_40px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 sm:p-6"
    : "relative mx-auto w-full max-w-2xl rounded-3xl bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_40px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 sm:p-6";
  const dropZoneClass = [
    "group relative w-full rounded-2xl border-2 border-dashed px-6 py-12 text-center outline-none transition-all duration-200 sm:py-14",
    isDragging
      ? "scale-[1.005] border-blue-400 bg-blue-50/70"
      : flash
        ? "border-blue-300 bg-blue-50/40"
        : "border-slate-200 bg-slate-50/60 hover:border-blue-300 hover:bg-blue-50/40 focus-visible:border-blue-400",
  ].join(" ");

  return (
    <div className="relative w-full font-[family-name:var(--font-dm-sans)] text-slate-900">
      <div className={shellClass}>
        <button
          type="button"
          className={dropZoneClass}
          onClick={() => fileInputRef.current?.click()}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div
            className={[
              "mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-100 transition-transform duration-200",
              isDragging ? "scale-110" : "group-hover:-translate-y-0.5",
            ].join(" ")}
          >
            <Upload className="h-7 w-7 text-blue-500" strokeWidth={2.2} />
          </div>
          <h3 className="font-[family-name:var(--font-sora)] text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-[28px]">
            {safeToLeave
              ? "Working in the background"
              : isProcessing
                ? "Checking your upload..."
                : isDragging
                  ? "Drop to add"
                  : isDashboard
                    ? "Drop your files here"
                    : "Drop files or click to browse"}
          </h3>
          <p className="mt-2 text-sm font-medium text-slate-500 sm:text-base">
            {safeToLeave
              ? "Safe to leave this page. Progress will continue."
              : "Any file, image, or link — MCQs extracted automatically"}
          </p>

          <input
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            className="hidden"
            multiple
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
        </button>

        {uploadedFiles.length > 0 ? (
          <div className="mt-4">
            <ul className="flex flex-col gap-2">
              {visibleSources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onRemove={removeFile}
                />
              ))}
            </ul>
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-2 w-full rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
              >
                View all {uploadedFiles.length}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200 transition-shadow focus-within:ring-2 focus-within:ring-blue-300">
          <Link2 className="h-[18px] w-[18px] shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste notes, a link, or MCQ text — press Enter"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 sm:text-[15px]"
          />
          {inputValue.trim() ? (
            <button
              type="button"
              onClick={submitInput}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700"
              aria-label="Add source"
            >
              <CornerDownLeft className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {globalError ? (
          <QuotaLimitBanner
            className="mt-4"
            key={globalError}
            message={globalError}
            modalOnly={globalErrorIsUpgrade}
            surface="upload_paywall"
          />
        ) : null}

        {showContinueLink && canContinue ? (
          <div className="mt-5 flex justify-end">
            <Link
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-gray-700"
              href="/dashboard"
            >
              {safeToLeave && !allFilesReady ? "View progress" : "Continue"}
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
          </div>
        ) : null}
      </div>

      {showAll ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setShowAll(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-100"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-bold text-slate-900">
                All sources
                <span className="ml-2 text-sm font-semibold text-slate-400">
                  {uploadedFiles.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="flex flex-col gap-2 overflow-y-auto p-4">
              {uploadedFiles.length === 0 ? (
                <li className="py-8 text-center text-sm text-slate-400">
                  No sources yet
                </li>
              ) : (
                uploadedFiles.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    onRemove={removeFile}
                  />
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
