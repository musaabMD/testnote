"use client";

import {
  computeOverallScore,
  computeStudyStreak,
} from "@/lib/dashboard-stats";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { api } from "../../../convex/_generated/api";
import { UserButton } from "@clerk/nextjs";
import {
  CheckoutButton,
  usePlans,
  useSubscription,
} from "@clerk/nextjs/experimental";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BadgePercent,
  CreditCard,
  Flame,
  Gem,
  X,
} from "lucide-react";
import Link from "next/link";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { captureConversionEvent } from "@/lib/conversion-analytics";

const statBtn =
  "group inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border-2 border-b-[4px] px-2.5 text-sm font-black tabular-nums shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-px active:border-b-2 sm:px-3";

const streakBtn =
  `${statBtn} border-orange-200 border-b-orange-300 bg-[#fff4e6] text-[#ff9600] shadow-[0_1px_0_#ffb84d]`;

const usageBtn =
  `${statBtn} border-sky-200 border-b-sky-300 bg-[#e9f7ff] text-[#1c84d8] shadow-[0_1px_0_#a6ddff]`;

const scoreBtn =
  `${statBtn} hidden border-red-200 border-b-red-300 bg-[#fff0f0] text-[#ff4b4b] shadow-[0_1px_0_#ffb3b3] sm:inline-flex`;

const iconBadge =
  "grid size-6 shrink-0 place-items-center rounded-full bg-white/80 shadow-[inset_0_-1px_0_rgba(15,23,42,0.08)]";

const CONVEX_AUTH_TIMEOUT_MS = 8000;

type UsageDashboard = {
  plan: string;
  planLabel: string;
  billingStatus: string;
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

type DashboardStatsProps = {
  files: PdfFileQueueItem[];
};

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function getPaymentPlanName(plan: string) {
  if (plan === "school" || plan === "max") return "Max";
  if (plan === "teams") return "Teams";
  if (plan === "starter") return "Starter";
  if (plan === "pro") return "Pro";
  return "Free";
}

function getBillingStatusLabel(status: string, plan = "free") {
  if (status === "active") return "Active";
  if (status === "upcoming") return "Starts soon";
  if (status === "trialing") return "Trial";
  if (status === "past_due") return "Past due";
  if (status === "canceled") return "Canceled";
  if (status === "ended") return "Ended";
  if (plan !== "free") return "Synced";
  return "No paid plan";
}

function getNextPlanSlug(plan: string) {
  if (plan === "pro") return "max";
  if (plan === "school" || plan === "max" || plan === "teams") return null;
  return "pro";
}

function getNextPlanLabel(planSlug: string | null) {
  if (planSlug === "max") return "Upgrade to Max";
  if (planSlug === "pro") return "Upgrade to Pro";
  return "Best plan active";
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
  const plans = usePlans({ for: "user", pageSize: 20 });
  const subscription = useSubscription({ for: "user" });
  const [mounted, setMounted] = useState(false);
  const [authWaitExpired, setAuthWaitExpired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [panel, setPanel] = useState<"usage" | "streak" | "score" | null>(null);
  const convexAuthTimedOut = authLoading && authWaitExpired;
  const usageUnavailable = convexAuthTimedOut || (!authLoading && !isAuthenticated);
  const usage: UsageDashboard | null | undefined = useQuery(
    api.users.getMyUsageDashboard,
    usageUnavailable ? "skip" : {},
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
  const currentClerkPlan = useMemo(() => {
    const subscriptionItems = subscription.data?.subscriptionItems ?? [];
    const paidItem =
      subscriptionItems.find(
        (item) => !item.plan.isDefault && item.status !== "ended",
      ) ?? subscriptionItems.find((item) => item.status !== "ended");

    if (!paidItem) return null;

    return {
      name: paidItem.plan.name,
      slug: paidItem.plan.slug,
      status: paidItem.status,
    };
  }, [subscription.data]);
  const currentPaymentPlanKey = currentClerkPlan?.slug ?? usage?.plan ?? "free";
  const nextPlanSlug = getNextPlanSlug(currentPaymentPlanKey);
  const nextPlanId = nextPlanSlug
    ? plans.data?.find((plan) => plan.slug === nextPlanSlug)?.id
    : undefined;

  return (
    <>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          aria-label={`${formatCredits(creditsRemaining)} credits remaining`}
          className={usageBtn}
          onClick={() => setPanel("usage")}
          title="View usage"
          type="button"
        >
          <span className={iconBadge}>
            <Gem className="size-4 stroke-[2.8]" aria-hidden />
          </span>
          <span>{formatCredits(creditsRemaining)}</span>
        </button>
        <button
          aria-label={`Score ${score}%`}
          className={scoreBtn}
          onClick={() => setPanel("score")}
          title={`Accuracy ${score}%`}
          type="button"
        >
          <span className={iconBadge}>
            <BadgePercent className="size-4 stroke-[2.8]" aria-hidden />
          </span>
          <span>{score}%</span>
        </button>
        <button
          aria-label={`${streak} day streak`}
          className={streakBtn}
          onClick={() => setPanel("streak")}
          title={`${streak} day streak`}
          type="button"
        >
          <span className={iconBadge}>
            <Flame className="size-4 fill-current stroke-[2.8]" aria-hidden />
          </span>
          <span>{streak}</span>
        </button>
        <UserButton />
      </div>

      {panel === "usage" ? (
        <UsagePanel
          checkoutPlanId={nextPlanId}
          checkoutPlanSlug={nextPlanSlug}
          checkoutUnavailable={Boolean(plans.isError)}
          currentPlanForUpgrade={currentPaymentPlanKey}
          paymentPlanName={
            currentClerkPlan?.name ?? getPaymentPlanName(usage?.plan ?? "free")
          }
          paymentStatus={
            currentClerkPlan?.status ?? usage?.billingStatus ?? "none"
          }
          paymentStatusLoading={subscription.isLoading}
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
  checkoutPlanId,
  checkoutPlanSlug,
  checkoutUnavailable,
  currentPlanForUpgrade,
  paymentPlanName,
  paymentStatus,
  paymentStatusLoading,
  usage,
  unavailable,
  onClose,
}: {
  checkoutPlanId?: string;
  checkoutPlanSlug: string | null;
  checkoutUnavailable: boolean;
  currentPlanForUpgrade: string;
  paymentPlanName: string;
  paymentStatus: string;
  paymentStatusLoading: boolean;
  usage:
    | {
        plan: string;
        planLabel: string;
        billingStatus: string;
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
      <div className="rounded-2xl border-2 border-sky-200 border-b-[5px] border-b-sky-300 bg-[#e9f7ff] p-5 shadow-[0_2px_0_#a6ddff]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/80 text-[#1c84d8] shadow-[inset_0_-1px_0_rgba(15,23,42,0.08)]">
              <Gem className="size-6 stroke-[2.8]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-black text-slate-950">{usage.planLabel}</p>
              <p className="text-xs font-bold text-sky-700">This month</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black tabular-nums leading-none text-[#1c84d8]">
              {formatCredits(usage.creditsRemaining)}
            </p>
            <p className="mt-1 text-xs font-bold text-sky-700">
              of {formatCredits(usage.creditsAllowance)} credits
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-slate-200 border-b-[5px] border-b-slate-300 bg-white p-4 shadow-[0_1px_0_#cbd5e1]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <CreditCard className="size-5 stroke-[2.6]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase text-slate-400">
              Current payment plan
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-lg font-black text-slate-950">
                {paymentPlanName}
              </p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
                {paymentStatusLoading
                  ? "Checking Clerk"
                  : getBillingStatusLabel(paymentStatus, usage.plan)}
              </span>
            </div>
          </div>
        </div>

        <UsageUpgradeAction
          currentPlan={currentPlanForUpgrade}
          planId={checkoutPlanId}
          planSlug={checkoutPlanSlug}
          unavailable={checkoutUnavailable}
        />
      </div>

      <UsageRow
        label="Uploads"
        used={usage.usage.filesUploaded}
        limit={usage.usage.filesLimit}
        accent="bg-[#1cb0f6]"
      />
      <UsageRow
        label="Pages processed"
        used={usage.usage.pagesProcessed}
        limit={usage.usage.pagesLimit}
        accent="bg-[#58cc02]"
      />
      <UsageRow
        label="Tutor messages"
        used={usage.usage.chatMessages}
        limit={usage.usage.chatLimit}
        accent="bg-[#ce82ff]"
      />
    </PanelShell>
  );
}

function UsageUpgradeAction({
  currentPlan,
  planId,
  planSlug,
  unavailable,
}: {
  currentPlan: string;
  planId?: string;
  planSlug: string | null;
  unavailable: boolean;
}) {
  const className =
    "mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300";

  if (!planSlug) {
    return (
      <button className={className} disabled type="button">
        Best plan active
      </button>
    );
  }

  if (!planId || unavailable) {
    return (
      <Link
        className={className}
        href="/pricing"
        onClick={() => {
          captureConversionEvent("quota_upgrade_clicked", {
            current_plan: currentPlan,
            plan_intent: planSlug,
            surface: "usage_panel",
          });
        }}
      >
        {getNextPlanLabel(planSlug)}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    );
  }

  return (
    <CheckoutButton
      for="user"
      planId={planId}
      planPeriod="month"
      newSubscriptionRedirectUrl={`/dashboard?checkout=success&plan=${encodeURIComponent(planSlug)}`}
    >
      <button
        className={className}
        onClick={() => {
          captureConversionEvent("quota_upgrade_clicked", {
            current_plan: currentPlan,
            plan_intent: planSlug,
            surface: "usage_panel",
          });
          captureConversionEvent("checkout_started", {
            plan_slug: planSlug,
            plan_period: "month",
            source_path: "/dashboard",
          });
        }}
        type="button"
      >
        {getNextPlanLabel(planSlug)}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </CheckoutButton>
  );
}

function UsageRow({
  label,
  used,
  limit,
  accent,
}: {
  label: string;
  used: number;
  limit: number;
  accent: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="rounded-2xl border-2 border-slate-200 border-b-[5px] border-b-slate-300 bg-white px-4 py-3 shadow-[0_1px_0_#cbd5e1]">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-black text-slate-800">{label}</span>
        <span className="font-black tabular-nums text-slate-500">
          {used}/{limit}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
        <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
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
      <div className="rounded-2xl border-2 border-red-200 border-b-[5px] border-b-red-300 bg-[#fff0f0] p-6 text-center shadow-[0_2px_0_#ffb3b3]">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-white/85 text-[#ff4b4b] shadow-[inset_0_-1px_0_rgba(15,23,42,0.08)]">
          <BadgePercent className="size-8 stroke-[2.8]" aria-hidden />
        </div>
        <p className="text-5xl font-black tabular-nums leading-none text-[#ff4b4b]">{score}%</p>
        <p className="mt-2 text-sm font-black text-red-800">Answer accuracy</p>
      </div>
      <p className="text-sm text-slate-500">
        Based on questions you have answered across {files.length || "your"} course
        {files.length === 1 ? "" : "s"}.
      </p>
    </PanelShell>
  );
}
