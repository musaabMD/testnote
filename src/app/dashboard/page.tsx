"use client";

import { useUser } from "@clerk/nextjs";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { FileList } from "@/components/pdf/file-list";
import {
  StudyOnboardingModal,
  type PendingOnboardingFile,
  type StudyOnboardingResult,
} from "@/components/study-onboarding-modal";
import { useStudyFiles } from "@/hooks/use-study-files";
import {
  filterSupportedUploadFiles,
  processPdfUploads,
} from "@/lib/process-pdf-upload";
import {
  getUnsupportedUploadReason,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "@/lib/upload-file-types";
import { captureConversionEvent } from "@/lib/conversion-analytics";
import { getUserDisplayName } from "@/lib/user-display-name";
import { APP_LOGO_URL, APP_NAME } from "@/lib/site-branding";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const { files, isLoading: filesLoading } = useStudyFiles();
  const isReady = !filesLoading;
  const [mounted, setMounted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [pendingOnboardingFiles, setPendingOnboardingFiles] = useState<
    PendingOnboardingFile[]
  >([]);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const pendingUploadFilesRef = useRef<File[] | null>(null);
  const uploadContextRef = useRef<StudyOnboardingResult | null>(null);
  const userName = mounted ? getUserDisplayName(user) : "You";

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    const planSlug = params.get("plan") ?? "unknown";
    const storageKey = `testnote:checkout_completed:${planSlug}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
    captureConversionEvent("checkout_completed", {
      plan_slug: planSlug,
      plan_period: "month",
    });
  }, []);

  const handleUpload = useCallback(
    async (
      incoming: FileList | File[] | null,
      context = uploadContextRef.current,
    ) => {
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
      let backgroundJobStarted = false;

      try {
        const queue = await processPdfUploads(supported, {
          append: true,
          addedBy: userName,
          examSlug: context?.examSlug,
          examName: context?.examName,
          backgroundOnJobStarted: true,
          onJobStarted: (record) => {
            backgroundJobStarted = true;
            setIsProcessing(false);
            if (supported.length !== 1) return;
            const fileParam = record.fileHash
              ? `file=${encodeURIComponent(record.fileHash)}&`
              : "";
            router.push(
              `/dashboard/content?${fileParam}job=${encodeURIComponent(record.jobId ?? record.id)}`,
            );
          },
        });
        if (!backgroundJobStarted && supported.length === 1) {
          const latestFile = queue
            .filter((file) => file.name === supported[0]?.name)
            .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))[0];
          if (latestFile) {
            router.push(`/dashboard/content?file=${encodeURIComponent(latestFile.id)}`);
          }
        }
      } catch (error) {
        setUploadError(
          error instanceof Error ? error.message : "File extraction failed.",
        );
      } finally {
        processingRef.current = false;
        setIsProcessing(false);
      }
    },
    [router, userName],
  );

  const beginUploadOnboarding = useCallback((files?: File[]) => {
    pendingUploadFilesRef.current = files ?? null;
    setPendingOnboardingFiles(
      files?.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      })) ?? [],
    );
    setOnboardingOpen(true);
  }, []);

  const handleOnboardingComplete = useCallback(
    (result: StudyOnboardingResult) => {
      uploadContextRef.current = result;
      const pendingFiles = pendingUploadFilesRef.current;
      pendingUploadFilesRef.current = null;
      setPendingOnboardingFiles([]);

      if (pendingFiles?.length) {
        void handleUpload(pendingFiles, result);
        return;
      }

      fileInputRef.current?.click();
    },
    [handleUpload],
  );

  const handleOnboardingClose = useCallback(() => {
    pendingUploadFilesRef.current = null;
    setPendingOnboardingFiles([]);
    setOnboardingOpen(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(false);
      const droppedFiles = Array.from(event.dataTransfer.files);
      if (droppedFiles.length) beginUploadOnboarding(droppedFiles);
    },
    [beginUploadOnboarding],
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
      const selectedFiles = Array.from(event.target.files ?? []);
      if (selectedFiles.length) beginUploadOnboarding(selectedFiles);
      event.target.value = "";
    },
    [beginUploadOnboarding],
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

      <StudyOnboardingModal
        open={onboardingOpen}
        onClose={handleOnboardingClose}
        onComplete={handleOnboardingComplete}
        pendingFiles={pendingOnboardingFiles}
      />

      <header className="sticky top-0 z-50 bg-white/90 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/78">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-3">
          <Link
            href="/"
            prefetch={false}
            className="flex shrink-0 items-center gap-2"
            aria-label={`${APP_NAME} home`}
          >
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

      <section className="mx-auto max-w-[920px] px-4 py-6 sm:px-6 sm:py-8">
        <FileList
          dragOver={dragOver}
          files={files ?? []}
          headerContent={<DashboardGreeting userName={userName} />}
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
