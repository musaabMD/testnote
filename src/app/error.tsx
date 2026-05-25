"use client";

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 text-slate-950">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
          Error
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight">
          Something went wrong.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          The page could not finish loading. Try again, or return to the
          dashboard and reopen the file.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            onClick={() => unstable_retry()}
            type="button"
          >
            Try again
          </button>
          <a
            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            href="/dashboard"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
