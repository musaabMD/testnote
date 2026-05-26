"use client";

import {
  computeOverallScore,
  computeStudyStreak,
} from "@/lib/dashboard-stats";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { api } from "../../../convex/_generated/api";
import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Flame, Sparkles, Target, X } from "lucide-react";
import Link from "next/link";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const pillBtn =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-bold tabular-nums text-slate-800 transition hover:bg-slate-50";

const streakBtn =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border-2 border-b-[4px] border-orange-200 bg-[#fff4e6] px-3 text-sm font-extrabold tabular-nums text-[#ff9600] shadow-[0_1px_0_#ffb84d] transition active:translate-y-px active:border-b-2";

const planLabel = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  school: "School",
} as const;

const CONVEX_AUTH_TIMEOUT_MS = 8000;

type UsageDashboard = {
  plan: string;
  planLabel: string;
  creditsRemaining: number;
  creditsAllowance: number;
  streak: number;
  usage: {
    filesUploaded: number;
    filesLimit: number;
    pagesProcessed: number;
    pagesLimit: number;
    chatMessages: number;
    chatLimit: number;
  };
};

function buildUsageDashboard(
  user:
    | {
        plan?: string | null;
        creditsRemaining?: number | null;
        monthlyCredits?: number | null;
        streak?: number | null;
        monthlyFileLimit?: number | null;
        monthlyPageLimit?: number | null;
        monthlyChatLimit?: number | null;
      }
    | null
    | undefined,
): UsageDashboard | null {
  if (!user) return null;

  const plan =
    user.plan === "starter" ||
    user.plan === "pro" ||
    user.plan === "school"
      ? user.plan
      : "free";
  const creditsAllowance = user.monthlyCredits ?? 1000;

  return {
    plan,
    planLabel: planLabel[plan],
    creditsRemaining: user.creditsRemaining ?? creditsAllowance,
    creditsAllowance,
    streak: user.streak ?? 0,
    usage: {
      filesUploaded: 0,
      filesLimit: user.monthlyFileLimit ?? 3,
      pagesProcessed: 0,
      pagesLimit: user.monthlyPageLimit ?? 100,
      chatMessages: 0,
      chatLimit: user.monthlyChatLimit ?? 600,
    },
  };
}

type DashboardStatsProps = {
  files: PdfFileQueueItem[];
};

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

class DashboardStatsBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function DashboardStatsInner({ files }: DashboardStatsProps) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [mounted, setMounted] = useState(false);
  const [authWaitExpired, setAuthWaitExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [panel, setPanel] = useState<"usage" | "streak" | "score" | null>(null);
  const convexAuthTimedOut = authLoading && authWaitExpired;
  const usageUnavailable = convexAuthTimedOut || (!authLoading && !isAuthenticated);
  const currentUser = useQuery(
    api.users.current,
    usageUnavailable ? "skip" : {},
  );
  const usage = useMemo(
    () => buildUsageDashboard(currentUser),
    [currentUser],
  );
  const upsertCurrent = useMutation(api.users.upsertCurrent);

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!authLoading) return;
    const timeout = window.setTimeout(() => {
      setAuthWaitExpired(true);
    }, CONVEX_AUTH_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [authLoading]);

  useEffect(() => {
    if (!mounted || !isAuthenticated || authLoading || convexAuthTimedOut) return;
    void upsertCurrent({}).catch(() => {});
  }, [authLoading, convexAuthTimedOut, isAuthenticated, mounted, upsertCurrent]);

  useEffect(() => {
    if (!mounted) return;
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("drnote-study-activity", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("drnote-study-activity", refresh);
    };
  }, [mounted]);

  const localStreak = useMemo(() => {
    void refreshKey;
    return mounted ? computeStudyStreak() : 0;
  }, [mounted, refreshKey]);
  const score = useMemo(() => {
    void refreshKey;
    return mounted ? computeOverallScore(files) : 0;
  }, [files, mounted, refreshKey]);
  const streak = mounted ? Math.max(localStreak, usage?.streak ?? 0) : 0;
  const creditsRemaining = mounted ? (usage?.creditsRemaining ?? 0) : 0;

  return (
    <>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          aria-label={`${formatCredits(creditsRemaining)} credits remaining`}
          className={pillBtn}
          onClick={() => setPanel("usage")}
          title="View usage"
          type="button"
        >
          <Sparkles className="size-4 text-slate-700" aria-hidden />
          <span>{formatCredits(creditsRemaining)}</span>
        </button>
        <button
          aria-label={`Score ${score}%`}
          className={`${pillBtn} hidden sm:inline-flex`}
          onClick={() => setPanel("score")}
          title={`Accuracy ${score}%`}
          type="button"
        >
          <Target className="size-4 text-indigo-600" aria-hidden />
          <span>{score}%</span>
        </button>
        <button
          aria-label={`${streak} day streak`}
          className={streakBtn}
          onClick={() => setPanel("streak")}
          title={`${streak} day streak`}
          type="button"
        >
          <Flame className="size-4 shrink-0" aria-hidden />
          {streak}
        </button>
        <UserButton />
      </div>

      {panel === "usage" ? (
        <UsagePanel
          usage={usage}
          unavailable={usageUnavailable}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === "streak" ? (
        <StreakPanel streak={streak} onClose={() => setPanel(null)} />
      ) : null}
      {panel === "score" ? (
        <ScorePanel files={files} score={score} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}

export function DashboardStats({ files }: DashboardStatsProps) {
  return (
    <DashboardStatsBoundary fallback={<UserButton />}>
      <DashboardStatsInner files={files} />
    </DashboardStatsBoundary>
  );
}

function PanelShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setPortalReady(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-slate-950/25"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          <button
            aria-label={`Close ${title.toLowerCase()}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

function UsagePanel({
  usage,
  unavailable,
  onClose,
}: {
  usage:
    | {
        plan: string;
        planLabel: string;
        creditsRemaining: number;
        creditsAllowance: number;
        usage: {
          filesUploaded: number;
          filesLimit: number;
          pagesProcessed: number;
          pagesLimit: number;
          chatMessages: number;
          chatLimit: number;
        };
      }
    | null
    | undefined;
  unavailable: boolean;
  onClose: () => void;
}) {
  if (unavailable) {
    return (
      <PanelShell title="Usage" onClose={onClose}>
        <p className="text-sm text-slate-500">
          Usage is unavailable because account sync is not ready.
        </p>
        <p className="text-xs leading-5 text-slate-400">
          Check the Clerk and Convex auth environment variables, then refresh.
        </p>
      </PanelShell>
    );
  }

  if (!usage) {
    return (
      <PanelShell title="Usage" onClose={onClose}>
        <p className="text-sm text-slate-500">Loading usage…</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Usage" onClose={onClose}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">{usage.planLabel}</p>
            <p className="text-xs text-slate-500">This month</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black tabular-nums text-slate-900">
              {formatCredits(usage.creditsRemaining)}
            </p>
            <p className="text-xs text-slate-500">
              of {formatCredits(usage.creditsAllowance)} credits
            </p>
          </div>
        </div>
      </div>

      <UsageRow
        label="Uploads"
        used={usage.usage.filesUploaded}
        limit={usage.usage.filesLimit}
      />
      <UsageRow
        label="Pages processed"
        used={usage.usage.pagesProcessed}
        limit={usage.usage.pagesLimit}
      />
      <UsageRow
        label="Tutor messages"
        used={usage.usage.chatMessages}
        limit={usage.usage.chatLimit}
      />

      {usage.plan === "free" ? (
        <Link
          className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-bold text-white transition hover:bg-zinc-800"
          href="/pricing"
        >
          Upgrade
        </Link>
      ) : null}
    </PanelShell>
  );
}

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-bold tabular-nums text-slate-500">
          {used}/{limit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StreakPanel({
  streak,
  onClose,
}: {
  streak: number;
  onClose: () => void;
}) {
  return (
    <PanelShell title="Streak" onClose={onClose}>
      <div className="rounded-2xl border-2 border-orange-200 border-b-[5px] bg-[#fff4e6] p-5 text-center shadow-[0_2px_0_#ffb84d]">
        <div className="flex items-center justify-center gap-2">
          <Flame className="size-7 text-[#ff9600]" aria-hidden />
          <p className="text-4xl font-extrabold tabular-nums text-[#ff9600]">
            {streak}
          </p>
        </div>
        <p className="mt-1 text-sm font-bold text-orange-800">day streak</p>
      </div>
      <p className="text-sm text-slate-500">
        Study today to keep your streak alive.
      </p>
    </PanelShell>
  );
}

function ScorePanel({
  score,
  files,
  onClose,
}: {
  score: number;
  files: PdfFileQueueItem[];
  onClose: () => void;
}) {
  return (
    <PanelShell title="Score" onClose={onClose}>
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-center">
        <p className="text-4xl font-black tabular-nums text-indigo-600">{score}%</p>
        <p className="mt-1 text-sm font-bold text-indigo-900">Answer accuracy</p>
      </div>
      <p className="text-sm text-slate-500">
        Based on questions you have answered across {files.length || "your"} course
        {files.length === 1 ? "" : "s"}.
      </p>
    </PanelShell>
  );
}
