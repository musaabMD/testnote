"use client";

import { loadQuizSessions, type QuizSessionRecord } from "@/lib/quiz-sessions";
import { ChevronRight, Clock, History } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

function formatWhen(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function modeLabel(mode: QuizSessionRecord["mode"]) {
  if (mode === "exam") return "Exam";
  return "Quiz";
}

export function FileSessionsList({ fileId }: { fileId: string }) {
  const [sessions] = useState<QuizSessionRecord[]>(() => loadQuizSessions());

  const fileSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.fileId === fileId &&
          (session.mode === "quiz" || session.mode === "exam"),
      ),
    [fileId, sessions],
  );

  if (!fileSessions.length) {
    return (
      <div className="rounded-xl border border-[#D9E8F7] bg-white/70 px-4 py-10 text-center">
        <History className="mx-auto size-8 text-slate-300" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-slate-500">No sessions yet</p>
        <p className="mt-1 text-xs text-slate-400">
          Complete a quiz or exam to see your results here.
        </p>
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-[#D9E8F7] bg-white/75">
      {fileSessions.map((session) => {
        const pct =
          session.total > 0
            ? Math.round((session.correct / session.total) * 100)
            : 0;

        return (
          <li key={session.id} className="border-b border-slate-100 last:border-b-0">
            <Link
              className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5"
              href={`/dashboard/content/analysis?file=${encodeURIComponent(session.fileId)}&session=${encodeURIComponent(session.id)}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{modeLabel(session.mode)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="size-3.5" aria-hidden />
                  {formatWhen(session.finishedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-black text-slate-950">
                    {session.correct}/{session.total}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">{pct}%</p>
                </div>
                <ChevronRight className="size-4 text-slate-300" aria-hidden />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
