"use client";

import { useUser } from "@clerk/nextjs";
import { FileList } from "@/components/pdf/file-list";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import {
  filterSupportedUploadFiles,
  processPdfUploads,
} from "@/lib/process-pdf-upload";
import { loadFiles } from "@/lib/pdf-view-storage";
import { getUserDisplayName } from "@/lib/user-display-name";
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

const LOGO_URL =
  "https://q648y7e0kt.ufs.sh/f/7bppoSdGjTuBsGmvNyR3mYU4jKNLJh5ZQuVOqsSP06Elv89c";

const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/*",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".heic",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
].join(",");

export default function PdfViewPage() {
  const { user } = useUser();
  const [files, setFiles] = useState<PdfFileQueueItem[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    setFiles(loadFiles());
    setIsReady(true);
  }, []);

  const handleUpload = useCallback(async (incoming: FileList | File[] | null) => {
    const supported = filterSupportedUploadFiles(incoming);
    if (!supported.length) {
      if (incoming && incoming.length > 0) {
        setUploadError("Unsupported file type. Try PDF, Word, images, or text.");
      }
      return;
    }

    if (processingRef.current) return;
    processingRef.current = true;
    setUploadError("");
    setIsProcessing(true);

    try {
      const queue = await processPdfUploads(supported, {
        append: true,
        addedBy: getUserDisplayName(user),
      });
      setFiles(queue);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "File extraction failed.",
      );
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [user]);

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

      <header className="sticky top-0 z-50 bg-transparent px-4">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="DrNote home">
            <Image
              alt="DrNote"
              className="size-8 rounded-xl object-contain"
              height={32}
              src={LOGO_URL}
              unoptimized
              width={32}
            />
            <span className="hidden font-[family-name:var(--font-sora)] text-lg font-black text-slate-950 sm:inline">
              DrNote
            </span>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <FileList
          dragOver={dragOver}
          files={files}
          isProcessing={isProcessing}
          isReady={isReady}
          onPickFiles={() => fileInputRef.current?.click()}
          uploadError={uploadError}
        />
      </section>

      <input
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
    </main>
  );
}
