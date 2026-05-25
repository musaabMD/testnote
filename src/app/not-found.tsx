import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 text-slate-950">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
          404
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight">
          Page not found.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          The page may have moved, or the file/session link no longer exists.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            href="/"
          >
            Home
          </Link>
          <Link
            className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            href="/dashboard"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
