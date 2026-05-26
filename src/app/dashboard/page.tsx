"use client";

import { useUser } from "@clerk/nextjs";
import { AddSourceCard } from "@/components/dashboard/add-source-card";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { FileList } from "@/components/pdf/file-list";
import { useStudyFiles } from "@/hooks/use-study-files";
import {
  filterSupportedUploadFiles,
  processPdfUploads,
} from "@/lib/process-pdf-upload";
import {
  getUnsupportedUploadReason,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "@/lib/upload-file-types";
import { getUserDisplayName } from "@/lib/user-display-name";
import { APP_LOGO_URL, APP_NAME } from "@/lib/site-branding";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

export default function DashboardPage() {
  const { user } = useUser();
  const { files, isLoading: filesLoading } = useStudyFiles();
  const isReady = !filesLoading;
  const [mounted, setMounted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const userName = mounted ? getUserDisplayName(user) : "You";

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleUpload = useCallback(
    async (incoming: FileList | File[] | null) => {
      const incomingFiles = incoming ? Array.from(incoming) : [];
      const unsupported = incomingFiles.find((file) => getUnsupportedUploadReason(file));
      if (unsupported) {
        setUploadError(getUnsupportedUploadReason(unsupported) ?? "Unsupported file type.");
        return;
      }

      const supported = filterSupportedUploadFiles(incoming);
      if (!supported.length) {
        if (incoming && incoming.length > 0) {
          setUploadError("Unsupported file type. Try PDF, images, text, markdown, or RTF.");
        }
        return;
      }

      if (processingRef.current) return;
      processingRef.current = true;
      setUploadError("");
      setIsProcessing(true);

      try {
        await processPdfUploads(supported, {
          append: true,
          addedBy: userName,
        });
      } catch (error) {
        setUploadError(
          error instanceof Error ? error.message : "File extraction failed.",
        );
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [userName],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(false);
      void handleUpload(event.dataTransfer.files);
    },
    [handleUpload],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOver(false);
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void handleUpload(event.target.files);
      event.target.value = "";
    },
    [handleUpload],
  );

  return (
    <main
      className={`relative min-h-screen bg-white text-slate-950 transition-colors ${
        dragOver ? "bg-sky-50/80" : ""
      }`}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragOver ? (
        <div className="pointer-events-none fixed inset-0 z-40 border-4 border-dashed border-sky-400 bg-sky-50/40" />
      ) : null}

      {isProcessing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-lg">
            <Loader2 className="mx-auto size-8 animate-spin text-sky-600" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-gray-700">
              Extracting questions…
            </p>
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-50 bg-white/80 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${APP_NAME} home`}>
            <Image
              alt={APP_NAME}
              className="size-8 rounded-xl object-contain"
              height={32}
              src={APP_LOGO_URL}
              unoptimized
              width={32}
            />
            <span className="hidden font-[family-name:var(--font-sora)] text-lg font-black text-slate-950 sm:inline">
              {APP_NAME}
            </span>
          </Link>
          <div className="flex-1" />
          <DashboardStats files={files ?? []} />
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <DashboardGreeting userName={userName} />

        {isReady && files && files.length > 0 ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900">Your courses</h3>
            <AddSourceCard
              isProcessing={isProcessing}
              onAdd={() => fileInputRef.current?.click()}
              onAddFiles={(incoming) => {
                void handleUpload(incoming);
              }}
            />
          </div>
        ) : null}

        <FileList
          dragOver={dragOver}
          files={files ?? []}
          isProcessing={isProcessing}
          isReady={isReady}
          onPickFiles={() => fileInputRef.current?.click()}
          showAddButton={false}
          showHeader={false}
          uploadError={uploadError}
        />
      </section>

      <input
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        className="hidden"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
    </main>
  );
}
