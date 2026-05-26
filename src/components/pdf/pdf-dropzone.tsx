"use client";

import {
  ArrowLeft,
  Brain,
  Check,
  CircleCheck,
  ClipboardPaste,
  File as FileIcon,
  FileSearch,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Scan,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { QuotaLimitBanner } from "@/components/quota-limit-banner";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { processPdfUploads } from "@/lib/process-pdf-upload";
import {
  filterSupportedUploadFiles,
  getUnsupportedUploadReason,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "@/lib/upload-file-types";
import { getUserDisplayName } from "@/lib/user-display-name";

type Screen = "drop" | "loading" | "done";

type QueuedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
};

type Phase = {
  icon: typeof FileSearch;
  title: string;
  sub: string;
  pct: number;
  dur: number;
  color: string;
  bg: string;
  ring: string;
};

const PHASES: Phase[] = [
  {
    icon: FileSearch,
    title: "Reading your file",
    sub: "Scanning the content",
    pct: 15,
    dur: 1600,
    color: "#185FA5",
    bg: "#E6F1FB",
    ring: "#85B7EB",
  },
  {
    icon: Scan,
    title: "Detecting structure",
    sub: "Finding pages and sections",
    pct: 30,
    dur: 1800,
    color: "#854F0B",
    bg: "#FAEEDA",
    ring: "#EF9F27",
  },
  {
    icon: Brain,
    title: "Understanding the content",
    sub: "AI is reading carefully",
    pct: 50,
    dur: 2200,
    color: "#534AB7",
    bg: "#EEEDFE",
    ring: "#AFA9EC",
  },
  {
    icon: Sparkles,
    title: "Finding the questions",
    sub: "Spotting every single one",
    pct: 68,
    dur: 1800,
    color: "#993556",
    bg: "#FBEAF0",
    ring: "#ED93B1",
  },
  {
    icon: ListChecks,
    title: "Organizing everything",
    sub: "Sorting and cleaning up",
    pct: 86,
    dur: 1400,
    color: "#0F6E56",
    bg: "#E1F5EE",
    ring: "#5DCAA5",
  },
  {
    icon: CircleCheck,
    title: "Almost there",
    sub: "Putting it all together",
    pct: 97,
    dur: 900,
    color: "#3B6D11",
    bg: "#EAF3DE",
    ring: "#97C459",
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIconMeta(type: string, name: string) {
  if (type.includes("pdf") || name.endsWith(".pdf")) {
    return { Icon: FileText, iconColor: "#991B1B", bg: "#FEF2F2" };
  }
  if (type.includes("word") || name.endsWith(".docx") || name.endsWith(".doc")) {
    return { Icon: FileText, iconColor: "#1D4ED8", bg: "#EFF6FF" };
  }
  if (type.includes("text") || name.endsWith(".txt")) {
    return { Icon: FileIcon, iconColor: "#475569", bg: "#F1F5F9" };
  }
  if (type.includes("image")) {
    return { Icon: ImageIcon, iconColor: "#0F766E", bg: "#F0FDFA" };
  }
  return { Icon: FileIcon, iconColor: "#475569", bg: "#F8FAFC" };
}

function normalizeClipboardFile(file: File, index: number) {
  if (file.name && file.name !== "blob") return file;

  if (file.type.startsWith("image/")) {
    const extension = file.type.split("/")[1] || "png";
    return new File([file], `pasted-image-${index + 1}.${extension}`, {
      type: file.type,
    });
  }

  return new File([file], `pasted-file-${index + 1}`, { type: file.type });
}

function extractClipboardFiles(clipboardData: DataTransfer | null) {
  if (!clipboardData) return [];

  const seen = new Set<string>();
  const files: File[] = [];

  const addFile = (file: File | null) => {
    if (!file) return;
    const key = `${file.name}-${file.size}-${file.type}-${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(normalizeClipboardFile(file, files.length));
  };

  Array.from(clipboardData.files).forEach(addFile);
  Array.from(clipboardData.items).forEach((item) => {
    if (item.kind !== "file") return;
    addFile(item.getAsFile());
  });

  return files;
}

function textFromClipboard(clipboardData: DataTransfer | null) {
  return clipboardData?.getData("text/plain").trim() ?? "";
}

function pastedTextFileName(text: string) {
  if (/^https?:\/\//i.test(text)) return "pasted-url.txt";
  return "pasted-text.txt";
}

export function PdfDropzone() {
  const router = useRouter();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const [screen, setScreen] = useState<Screen>("drop");
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [iconVisible, setIconVisible] = useState(true);
  const [msgVisible, setMsgVisible] = useState(true);
  const [error, setError] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [manualText, setManualText] = useState("");
  const [extractedCount, setExtractedCount] = useState(0);
  const processingRef = useRef(false);
  const lastBatchRef = useRef("");

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const incomingFiles = Array.from(incoming);
    const unsupported = incomingFiles.find((file) => getUnsupportedUploadReason(file));
    if (unsupported) {
      setError(getUnsupportedUploadReason(unsupported) ?? "Unsupported file type.");
      return;
    }

    const next = filterSupportedUploadFiles(incomingFiles).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      }));

    if (!next.length) {
      setError("Choose at least one file to upload.");
      return;
    }

    setError("");
    setFiles((prev) => {
      const seen = new Set(prev.map((item) => `${item.name}-${item.size}`));
      const unique = next.filter((item) => !seen.has(`${item.name}-${item.size}`));
      return [...prev, ...unique];
    });
  }, []);

  const pendingFilesRef = useRef<QueuedFile[]>([]);

  useEffect(() => {
    pendingFilesRef.current = files;
  }, [files]);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const reset = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    processingRef.current = false;
    lastBatchRef.current = "";
    setFiles([]);
    setScreen("drop");
    setProgress(0);
    setPhaseIdx(0);
    setExtractedCount(0);
    setError("");
    setTextOpen(false);
    setManualText("");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    addFiles(event.dataTransfer.files);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const addManualText = useCallback(() => {
    const text = manualText.trim();
    if (!text) {
      setError("Paste text before importing.");
      return;
    }
    const blob = new Blob([text], { type: "text/plain" });
    const file = new File([blob], pastedTextFileName(text), {
      type: "text/plain",
    });
    addFiles([file]);
    setManualText("");
    setTextOpen(false);
  }, [addFiles, manualText]);

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      if (screen !== "drop") return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable='true']")
      ) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const clipFiles = extractClipboardFiles(clipboardData);
      const supportedFiles = filterSupportedUploadFiles(clipFiles);
      if (supportedFiles.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        addFiles(supportedFiles);
        return;
      }

      const text = textFromClipboard(clipboardData);
      if (!text) return;

      event.preventDefault();
      event.stopPropagation();
      const blob = new Blob([text], { type: "text/plain" });
      const file = new File([blob], pastedTextFileName(text), {
        type: "text/plain",
      });
      addFiles([file]);
    },
    [addFiles, screen],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const processFiles = useCallback(async (selected: QueuedFile[]) => {
    try {
      const queue = await processPdfUploads(
        selected.map((item) => item.file),
        { append: true, addedBy: getUserDisplayName(user) },
      );
      const totalQuestions = queue.reduce(
        (count, item) => count + item.result.mcqs.length,
        0,
      );
      setExtractedCount(totalQuestions);
      setProgress(100);
      setScreen("done");

      window.setTimeout(() => {
        router.push("/dashboard");
      }, 900);
    } catch (uploadError) {
      processingRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setScreen("drop");
      setProgress(0);
      setPhaseIdx(0);
      setError(
        uploadError instanceof Error ? uploadError.message : "File extraction failed.",
      );
    }
  }, [router, user]);

  useEffect(() => {
    if (screen !== "drop" || files.length === 0 || processingRef.current) return;
    const batchKey = files
      .map((item) => item.id)
      .sort()
      .join("|");
    if (batchKey === lastBatchRef.current) return;
    lastBatchRef.current = batchKey;
    processingRef.current = true;
    setError("");
    setScreen("loading");
    setPhaseIdx(0);
    setProgress(0);
    void processFiles(pendingFilesRef.current);
  }, [files, processFiles, screen]);

  const startProcessing = () => {
    if (files.length === 0 || processingRef.current) return;
    lastBatchRef.current = "";
    processingRef.current = true;
    setError("");
    setScreen("loading");
    setPhaseIdx(0);
    setProgress(0);
    void processFiles(files);
  };

  useEffect(() => {
    if (screen !== "loading") return;

    const runPhase = (index: number) => {
      setIconVisible(false);
      setMsgVisible(false);
      window.setTimeout(() => {
        setPhaseIdx(index);
        setProgress(PHASES[index]!.pct);
        setIconVisible(true);
        setMsgVisible(true);
      }, 230);

      if (index < PHASES.length - 1) {
        timerRef.current = window.setTimeout(
          () => runPhase(index + 1),
          PHASES[index]!.dur,
        );
      }
    };

    runPhase(0);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [screen]);

  const phase = PHASES[phaseIdx]!;
  const PhaseIcon = phase.icon;

  return (
    <div className="w-full font-[family-name:var(--font-dm-sans)]">
      <div
        className={`relative mx-auto w-full max-w-[720px] overflow-hidden rounded-[28px] border-2 border-dashed border-[#d1d1d1] bg-[#fafafa] shadow-sm transition-all duration-300 outline-none focus-visible:ring-4 focus-visible:ring-slate-200/80 ${
          dragOver
            ? "border-slate-400 bg-[#f5f5f5] ring-4 ring-slate-200/60"
            : "hover:border-[#bdbdbd]"
        }`}
        aria-label="Upload files by dropping, browsing, or pasting with Ctrl+V"
        onDragLeave={() => setDragOver(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDrop={handleDrop}
        role="region"
        tabIndex={0}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(148,163,184,0.06),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:32px_32px]"
        />

        {screen === "drop" ? (
          <div className="relative px-8 py-12 sm:px-12 sm:py-14">
            <div className="mb-8 text-center">
              <div className="relative mx-auto mb-5 size-20 sm:size-[5.5rem]">
                <div
                  className={`absolute inset-0 rounded-[22px] blur-xl transition-opacity duration-300 ${
                    dragOver ? "bg-slate-300/40" : "bg-slate-200/30"
                  }`}
                />
                <div
                  className={`relative grid size-full place-items-center rounded-[22px] border bg-white shadow-sm transition-all duration-300 ${
                    dragOver
                      ? "border-slate-400 text-slate-700"
                      : "border-[#d1d1d1] text-slate-600"
                  }`}
                >
                  <Upload className="size-9 sm:size-10" strokeWidth={2.2} />
                </div>
              </div>
              <p className="m-0 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
                Drop your file here
              </p>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-slate-500 sm:text-base">
                PDF, images, or text — paste with{" "}
                <kbd className="rounded-md border border-[#d1d1d1] bg-white px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  Ctrl+V
                </kbd>
              </p>
            </div>

            {files.length > 0 ? (
              <div className="mb-5 flex flex-col gap-1.5">
                {files.map((file) => {
                  const meta = fileIconMeta(file.type, file.name);
                  const FileIcon = meta.Icon;
                  return (
                    <div
                      key={file.id}
                      className="group flex items-center gap-2.5 rounded-xl border border-[#d1d1d1] bg-white px-3 py-2.5 animate-in slide-in-from-left-2 duration-200"
                    >
                      <div
                        className="grid size-9 shrink-0 place-items-center rounded-[9px]"
                        style={{ background: meta.bg }}
                      >
                        <FileIcon className="size-[18px]" style={{ color: meta.iconColor }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-[13px] font-medium text-slate-800">
                          {file.name}
                        </p>
                        <p className="m-0 text-xs text-slate-500">{formatBytes(file.size)}</p>
                      </div>
                      <button
                        aria-label={`Remove ${file.name}`}
                        className="flex items-center rounded-md p-1 text-slate-400 opacity-0 transition hover:text-slate-600 group-hover:opacity-100"
                        onClick={() => removeFile(file.id)}
                        type="button"
                      >
                        <X className="size-[15px]" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div
              className={`flex flex-wrap justify-center gap-3 ${
                files.length > 0 ? "mb-6" : "mb-8"
              }`}
            >
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[#d1d1d1] bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#bdbdbd] hover:bg-[#f5f5f5]"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload className="size-4 text-slate-600" />
                Upload files
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[#d1d1d1] bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#bdbdbd] hover:bg-[#f5f5f5]"
                onClick={() => setTextOpen((value) => !value)}
                type="button"
              >
                <ClipboardPaste className="size-4 text-slate-600" />
                Paste text
              </button>
            </div>

            {textOpen ? (
              <div className="mb-5 flex flex-col gap-2">
                <textarea
                  className="min-h-28 w-full resize-y rounded-xl border border-[#d1d1d1] bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  onChange={(event) => setManualText(event.target.value)}
                  placeholder="Paste copied notes or questions here..."
                  value={manualText}
                />
                <button
                  className="self-end rounded-xl bg-slate-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-500"
                  onClick={addManualText}
                  type="button"
                >
                  Import text
                </button>
              </div>
            ) : null}

            {error && files.length > 0 ? (
              <button
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-600 px-5 py-4 text-base font-bold text-white transition hover:bg-slate-500"
                onClick={startProcessing}
                type="button"
              >
                <Sparkles className="size-5" />
                Retry extraction
              </button>
            ) : files.length > 0 ? (
              <p className="m-0 text-center text-sm font-medium text-slate-600">
                Extracting questions from {files.length} file{files.length > 1 ? "s" : ""}…
              </p>
            ) : (
              <p className="m-0 text-center text-sm font-medium tracking-wide text-slate-400">
                PDF · Images · TXT · Markdown
              </p>
            )}

            <input
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              className="hidden"
              multiple
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
          </div>
        ) : null}

        {screen === "loading" ? (
          <div className="relative flex min-h-[360px] flex-col items-center justify-center px-8 py-12 sm:min-h-[400px] sm:px-12">
            <div className="relative mb-8 size-[92px]">
              <div
                className="absolute inset-0 rounded-[24px] transition-colors duration-300"
                style={{ background: phase.bg }}
              />
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  iconVisible ? "animate-in zoom-in-50 duration-300" : "animate-out zoom-out-50 duration-200"
                }`}
                key={phaseIdx}
              >
                <PhaseIcon className="size-9" style={{ color: phase.color }} />
              </div>
              <svg
                className="absolute -inset-[9px] size-[110px] animate-spin"
                style={{ animationDuration: "1.6s" }}
                viewBox="0 0 110 110"
              >
                <circle cx="55" cy="55" fill="none" r="49" stroke={phase.bg} strokeWidth="3" />
                <circle
                  cx="55"
                  cy="55"
                  fill="none"
                  r="49"
                  stroke={phase.ring}
                  strokeDasharray="75 233"
                  strokeLinecap="round"
                  strokeWidth="3"
                />
              </svg>
            </div>

            <div className="mb-7 flex flex-wrap justify-center gap-1.5">
              {PHASES.map((item, index) => {
                const isActive = index === phaseIdx;
                const isDone = index < phaseIdx;
                const PillIcon = isDone ? Check : item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-center gap-1.5 rounded-full transition-all duration-300"
                    style={{
                      padding: isActive ? "5px 12px" : "5px 10px",
                      border: isActive ? `1.5px solid ${item.ring}` : "1px solid #e2e8f0",
                      background: isActive ? item.bg : isDone ? "#f8fafc" : "#fff",
                    }}
                  >
                    <PillIcon
                      className="size-[13px]"
                      style={{ color: isDone ? "#3B6D11" : isActive ? item.color : "#ccc" }}
                    />
                    {isActive ? (
                      <span
                        className="whitespace-nowrap text-xs font-medium"
                        style={{ color: item.color }}
                      >
                        {item.title}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mb-7 flex min-h-14 flex-col items-center justify-center text-center">
              <p
                className={`m-0 mb-1 text-xl font-medium text-slate-900 ${
                  msgVisible ? "animate-in fade-in slide-in-from-bottom-2 duration-300" : "opacity-0"
                }`}
              >
                {phase.title}
              </p>
              <p
                className={`m-0 text-[13px] text-slate-500 ${
                  msgVisible ? "animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75" : "opacity-0"
                }`}
              >
                {phase.sub}
              </p>
            </div>

            <div className="h-1 w-full max-w-[340px] overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: phase.color,
                }}
              />
            </div>
          </div>
        ) : null}

        {screen === "done" ? (
          <div className="relative flex min-h-[360px] flex-col items-center justify-center gap-4 px-8 py-12 sm:min-h-[400px] sm:px-12">
            <div className="grid size-[76px] place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-200 animate-in zoom-in-50 duration-500">
              <Check className="size-9 text-emerald-600" />
            </div>
            <p className="m-0 text-xl font-medium text-slate-900">Questions extracted</p>
            <p className="m-0 text-[13px] text-slate-500">
              Found {extractedCount} question{extractedCount === 1 ? "" : "s"} across{" "}
              {files.length} file{files.length > 1 ? "s" : ""}
            </p>
            <button
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#d1d1d1] bg-white px-[18px] py-2.5 text-[13px] text-slate-600 transition hover:border-[#bdbdbd] hover:bg-[#f5f5f5]"
              onClick={reset}
              type="button"
            >
              <ArrowLeft className="size-3.5" />
              Upload another
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <QuotaLimitBanner className="mt-4" message={error} />
      ) : null}
    </div>
  );
}
