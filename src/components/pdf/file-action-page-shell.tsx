"use client";

import { useStudyFile } from "@/hooks/use-study-files";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

const LOGO_URL =
  "https://q648y7e0kt.ufs.sh/f/7bppoSdGjTuBsGmvNyR3mYU4jKNLJh5ZQuVOqsSP06Elv89c";

type FileActionPageShellProps = {
  title: string;
  children: (file: NonNullable<ReturnType<typeof useStudyFile>["file"]>) => ReactNode;
};

export function FileActionPageShell({ title, children }: FileActionPageShellProps) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-white text-sm font-semibold text-slate-400">
          Loading…
        </main>
      }
    >
      <FileActionPageShellContent title={title}>{children}</FileActionPageShellContent>
    </Suspense>
  );
}

function FileActionPageShellContent({
  title,
  children,
}: FileActionPageShellProps) {
  const searchParams = useSearchParams();
  const fileId = searchParams.get("file") ?? "";
  const { file, isLoading } = useStudyFile(fileId);

  return (
    <main className="flex min-h-screen flex-col bg-[#F7F8FC] font-[family-name:var(--font-dm-sans)] text-slate-950">
      <header className="sticky top-0 z-50 shrink-0 border-b border-slate-200/70 bg-white/95 px-4 backdrop-blur">
        <div className="mx-auto grid h-16 max-w-[1180px] grid-cols-3 items-center">
          <Link
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
            href="/dashboard"
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
              alt="DrNote"
              className="size-8 rounded-xl object-contain"
              height={32}
              src={LOGO_URL}
              unoptimized
              width={32}
            />
              <span className="hidden font-[family-name:var(--font-sora)] text-lg font-black text-slate-950 sm:inline">
                {title}
              </span>
            </Link>

          <span className="justify-self-end text-right text-xs font-semibold text-slate-400 sm:text-sm">
            DrNote
          </span>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {isLoading ? (
          <div className="rounded-[20px] border border-[#E8E3FF] bg-white p-10 text-center">
            <p className="text-sm font-semibold text-slate-400">Loading file…</p>
          </div>
        ) : !file ? (
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
        ) : (
          children(file)
        )}
      </section>
    </main>
  );
}
