"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import type { AdminClerkSnapshot } from "@/lib/admin-clerk-types";

type RangeKey = "7d" | "30d" | "90d";
type DetailKey = "growth" | "uploads" | "costs" | "coverage";
type NorthStarMetrics = FunctionReturnType<typeof api.admin.getNorthStarMetrics>;

type MetricFact = {
  label: string;
  value: string;
  change?: number;
};

const ranges: Array<{ value: RangeKey; label: string; days: number }> = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
];

function money(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  });
}

function number(value: number | undefined) {
  return (value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function pct(value: number | undefined) {
  return `${(value ?? 0).toFixed(1)}%`;
}

function percentOf(part: number | undefined, total: number | undefined) {
  if (!total) return 0;
  return ((part ?? 0) / total) * 100;
}

function formatDate(value: number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminDashboard({
  clerkSnapshot,
}: {
  clerkSnapshot: AdminClerkSnapshot;
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [activeDetail, setActiveDetail] = useState<DetailKey | null>(null);
  const [toTimestamp, setToTimestamp] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setToTimestamp(Date.now());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const { from, to } = useMemo(() => {
    const selected = ranges.find((item) => item.value === range) ?? ranges[1];
    const to = toTimestamp ?? 0;
    return {
      from: to - selected.days * 24 * 60 * 60 * 1000,
      to,
    };
  }, [range, toTimestamp]);

  const queryRange = toTimestamp ? { from, to } : "skip";
  const northStar = useQuery(
    api.admin.getNorthStarMetrics,
    toTimestamp ? { to: toTimestamp } : "skip",
  );
  const users = useQuery(
    api.admin.getUserProfitability,
    activeDetail === "growth" && toTimestamp ? { from, to, limit: 20 } : "skip",
  );
  const files = useQuery(
    api.admin.getFileAnalytics,
    activeDetail === "uploads" && toTimestamp ? { from, to, limit: 20 } : "skip",
  );
  const exams = useQuery(
    api.admin.getExamAnalytics,
    activeDetail === "coverage" ? queryRange : "skip",
  );
  const models = useQuery(
    api.admin.getModelCosts,
    activeDetail === "costs" ? queryRange : "skip",
  );
  const quality = useQuery(
    api.admin.getQualityMetrics,
    activeDetail === "uploads" ? queryRange : "skip",
  );

  if (!northStar) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-6 text-zinc-100">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            DrNote Admin
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Loading dashboard</h1>
        </div>
      </main>
    );
  }

  const clerkActiveRatePct = percentOf(
    clerkSnapshot.activeUsers30d,
    clerkSnapshot.totalUsers,
  );

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-300">
              North-star metrics
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              DrNote Admin
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Production Clerk users and billing, plus upload, cost, and coverage metrics from the product ledgers.
            </p>
            {!clerkSnapshot.available ? (
              <p className="mt-2 max-w-2xl text-xs text-amber-300">
                Clerk metrics unavailable: {clerkSnapshot.error}
              </p>
            ) : null}
          </div>

          <div className="flex w-full max-w-xs flex-col gap-3">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-violet-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-violet-300"
              href="/admin/support"
            >
              Support inbox
            </Link>
            <label className="flex flex-col gap-2 text-sm text-zinc-400">
              Range
              <select
                className="h-10 rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-300"
                onChange={(event) => setRange(event.target.value as RangeKey)}
                value={range}
              >
                {ranges.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            active={activeDetail === "growth"}
            facts={[
              fact("24h", number(clerkSnapshot.newUsers.day.count), clerkSnapshot.newUsers.day.pctChange),
              fact("7d", number(clerkSnapshot.newUsers.week.count), clerkSnapshot.newUsers.week.pctChange),
              fact("30d", number(clerkSnapshot.newUsers.month.count), clerkSnapshot.newUsers.month.pctChange),
            ]}
            onClick={() => toggleDetail("growth", activeDetail, setActiveDetail)}
            subtitle="New signups from the production Clerk user list"
            title="New users"
            value={number(clerkSnapshot.newUsers.week.count)}
          />
          <MetricCard
            active={activeDetail === "growth"}
            facts={[
              fact("24h", number(clerkSnapshot.activeUsers.day.count), clerkSnapshot.activeUsers.day.pctChange),
              fact("7d", number(clerkSnapshot.activeUsers.week.count), clerkSnapshot.activeUsers.week.pctChange),
              fact("30d", number(clerkSnapshot.activeUsers.month.count), clerkSnapshot.activeUsers.month.pctChange),
            ]}
            onClick={() => toggleDetail("growth", activeDetail, setActiveDetail)}
            subtitle={`${pct(clerkActiveRatePct)} monthly active rate from ${number(
              clerkSnapshot.totalUsers,
            )} Clerk users`}
            title="Active users"
            value={number(clerkSnapshot.activeUsers.month.count)}
          />
          <MetricCard
            active={activeDetail === "growth"}
            facts={[
              fact("Paid", number(clerkSnapshot.paidUsers)),
              fact("Free", number(clerkSnapshot.freeUsers)),
              fact("Lifetime", money(clerkSnapshot.lifetimeRevenueUsd)),
            ]}
            onClick={() => toggleDetail("growth", activeDetail, setActiveDetail)}
            subtitle={`${number(clerkSnapshot.paidUsers)} paid users, ${money(
              clerkSnapshot.nextPaymentRevenueUsd,
            )} scheduled next payments`}
            title="Clerk revenue"
            value={money(clerkSnapshot.monthlyRecurringRevenueUsd)}
          />
          <MetricCard
            active={activeDetail === "uploads"}
            facts={[
              fact("24h", number(northStar.uploads.uploaded.day.count), northStar.uploads.uploaded.day.pctChange),
              fact("7d", number(northStar.uploads.uploaded.week.count), northStar.uploads.uploaded.week.pctChange),
              fact("30d", number(northStar.uploads.uploaded.month.count), northStar.uploads.uploaded.month.pctChange),
            ]}
            onClick={() => toggleDetail("uploads", activeDetail, setActiveDetail)}
            subtitle={`${number(northStar.uploads.repeatUploadersThisMonth)} repeat uploaders, ${pct(
              northStar.uploads.repeatUploaderRatePct,
            )} repeat rate`}
            title="Files uploaded"
            value={number(northStar.uploads.uploaded.week.count)}
          />
          <MetricCard
            active={activeDetail === "costs"}
            facts={[
              fact("24h", money(northStar.costs.mistralOcr.day.costUsd), northStar.costs.mistralOcr.day.pctChange),
              fact("7d", money(northStar.costs.mistralOcr.week.costUsd), northStar.costs.mistralOcr.week.pctChange),
              fact("30d", money(northStar.costs.mistralOcr.month.costUsd), northStar.costs.mistralOcr.month.pctChange),
            ]}
            onClick={() => toggleDetail("costs", activeDetail, setActiveDetail)}
            subtitle="Mistral provider/model entries in the cost ledger"
            title="Mistral OCR cost"
            value={money(northStar.costs.mistralOcr.month.costUsd)}
          />
          <MetricCard
            active={activeDetail === "costs"}
            facts={[
              fact("24h", money(northStar.costs.openRouter.day.costUsd), northStar.costs.openRouter.day.pctChange),
              fact("7d", money(northStar.costs.openRouter.week.costUsd), northStar.costs.openRouter.week.pctChange),
              fact("30d", money(northStar.costs.openRouter.month.costUsd), northStar.costs.openRouter.month.pctChange),
            ]}
            onClick={() => toggleDetail("costs", activeDetail, setActiveDetail)}
            subtitle={`${money(northStar.costs.totalAi.month.costUsd)} total tracked AI cost in 30d`}
            title="OpenRouter cost"
            value={money(northStar.costs.openRouter.month.costUsd)}
          />
          <MetricCard
            active={activeDetail === "coverage"}
            facts={[
              fact("Deep", number(northStar.coverage.deepExamsThisMonth)),
              fact("Files/exam", number(northStar.coverage.filesPerCoveredExam)),
              fact("Questions", number(northStar.coverage.questionsThisMonth)),
            ]}
            onClick={() => toggleDetail("coverage", activeDetail, setActiveDetail)}
            subtitle="Real exams/courses with uploads in the last 30 days"
            title="Market coverage"
            value={number(northStar.coverage.examsCoveredThisMonth)}
          />
        </section>

        {activeDetail ? (
          <DetailPanel
            activeDetail={activeDetail}
            clerkSnapshot={clerkSnapshot}
            exams={exams ?? []}
            files={files ?? []}
            models={models ?? []}
            northStar={northStar}
            quality={quality}
            users={users ?? []}
          />
        ) : (
          <section className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-zinc-400">
            Click a metric to inspect the underlying users, files, model costs, or coverage rows.
          </section>
        )}
      </div>
    </main>
  );
}

function DetailPanel({
  activeDetail,
  clerkSnapshot,
  exams,
  files,
  models,
  northStar,
  quality,
  users,
}: {
  activeDetail: DetailKey;
  clerkSnapshot: AdminClerkSnapshot;
  exams: Array<{
    examGoal: string;
    users: number;
    revenueUsd: number;
    cogsUsd: number;
    profitUsd: number;
    marginPct: number;
    avgFilesPerUser: number;
    avgPuPerUser: number;
  }>;
  files: Array<{
    originalName: string;
    userEmail: string;
    fileType: string;
    pageCount: number;
    puCharged: number;
    questionCount: number;
    retryCount: number;
    needsReviewCount: number;
    totalCostUsd: number;
    status: string;
    redFlags: string[];
  }>;
  models: Array<{
    provider: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    avgCostPerCall: number;
  }>;
  northStar: NorthStarMetrics;
  quality:
    | {
        detectedQuestions: number;
        extractedQuestions: number;
        failedPages: number;
        averageConfidence: number;
        byFileType: Array<{
          fileType: string;
          retryRatePct: number;
          needsReviewRatePct: number;
          failureRatePct: number;
        }>;
      }
    | undefined;
  users: Array<{
    email: string;
    plan: string;
    examGoal: string | null;
    revenueUsd: number;
    cogsUsd: number;
    profitUsd: number;
    marginPct: number;
    puUsed: number;
    filesUploaded: number;
    redFlags: string[];
  }>;
}) {
  if (activeDetail === "growth") {
    return (
      <div className="grid gap-6">
        <Section title="Growth detail">
          <SimpleTable
            columns={["Metric", "24h", "24h %", "7d", "7d %", "30d", "30d %"]}
            rows={[
              growthRow("Clerk registered users", clerkSnapshot.newUsers),
              growthRow("Clerk active users", clerkSnapshot.activeUsers),
              growthRow("Convex registered users", northStar.growth.registered),
              growthRow("Convex active users", northStar.growth.active),
            ]}
          />
        </Section>
        <Section title="Clerk users and billing">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Total Clerk users" value={number(clerkSnapshot.totalUsers)} />
            <Kpi title="Paid users" value={number(clerkSnapshot.paidUsers)} />
            <Kpi title="MRR" value={money(clerkSnapshot.monthlyRecurringRevenueUsd)} />
            <Kpi title="Lifetime paid" value={money(clerkSnapshot.lifetimeRevenueUsd)} />
          </div>
          <SimpleTable
            columns={[
              "User",
              "Name",
              "Joined",
              "Last active",
              "Last sign-in",
              "Plan",
              "Status",
              "MRR",
              "Lifetime paid",
            ]}
            rows={clerkSnapshot.users.map((user) => [
              user.email,
              user.name,
              formatDate(user.createdAt),
              formatDate(user.lastActiveAt),
              formatDate(user.lastSignInAt),
              user.plan,
              user.subscriptionStatus,
              money(user.mrrUsd),
              money(user.lifetimePaidUsd),
            ])}
          />
        </Section>
        <Section title="Users needing margin attention">
          <SimpleTable
            columns={[
              "User",
              "Plan",
              "Exam",
              "Revenue",
              "COGS",
              "Profit",
              "Margin",
              "PU",
              "Files",
              "Flags",
            ]}
            rows={users.map((user) => [
              user.email,
              user.plan,
              user.examGoal ?? "-",
              money(user.revenueUsd),
              money(user.cogsUsd),
              money(user.profitUsd),
              pct(user.marginPct),
              number(user.puUsed),
              number(user.filesUploaded),
              user.redFlags.length ? user.redFlags.join(", ") : "-",
            ])}
          />
        </Section>
      </div>
    );
  }

  if (activeDetail === "uploads") {
    return (
      <div className="grid gap-6">
        <Section title="Upload detail">
          <SimpleTable
            columns={["Metric", "24h", "24h %", "7d", "7d %", "30d", "30d %"]}
            rows={[
              growthRow("Files uploaded", northStar.uploads.uploaded),
              growthRow("Unique uploaders", northStar.uploads.uniqueUploaders),
            ]}
          />
        </Section>
        <Section title="Most expensive files">
          <SimpleTable
            columns={[
              "File",
              "User",
              "Type",
              "Pages",
              "PU",
              "Questions",
              "Retries",
              "Needs review",
              "Cost",
              "Status",
              "Flags",
            ]}
            rows={files.map((file) => [
              file.originalName,
              file.userEmail,
              file.fileType,
              number(file.pageCount),
              number(file.puCharged),
              number(file.questionCount),
              number(file.retryCount),
              number(file.needsReviewCount),
              money(file.totalCostUsd),
              file.status,
              file.redFlags.length ? file.redFlags.join(", ") : "-",
            ])}
          />
        </Section>
        <Section title="Extraction quality">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Detected questions" value={number(quality?.detectedQuestions)} />
            <Kpi title="Extracted questions" value={number(quality?.extractedQuestions)} />
            <Kpi title="Failed pages" value={number(quality?.failedPages)} />
            <Kpi title="Avg confidence" value={number(quality?.averageConfidence)} />
          </div>
          <SimpleTable
            columns={["File type", "Retry rate", "Needs-review rate", "Failure rate"]}
            rows={(quality?.byFileType ?? []).map((row) => [
              row.fileType,
              pct(row.retryRatePct),
              pct(row.needsReviewRatePct),
              pct(row.failureRatePct),
            ])}
          />
        </Section>
      </div>
    );
  }

  if (activeDetail === "costs") {
    return (
      <div className="grid gap-6">
        <Section title="Cost detail">
          <SimpleTable
            columns={["Provider", "24h", "24h %", "7d", "7d %", "30d", "30d %"]}
            rows={[
              costRow("Mistral OCR", northStar.costs.mistralOcr),
              costRow("OpenRouter", northStar.costs.openRouter),
              costRow("Total tracked AI", northStar.costs.totalAi),
            ]}
          />
          <p className="mt-3 text-xs text-zinc-500">
            Mistral OCR is shown only when costLedger has a Mistral provider or model entry.
          </p>
        </Section>
        <Section title="AI model costs">
          <SimpleTable
            columns={[
              "Provider",
              "Model",
              "Calls",
              "Input tokens",
              "Output tokens",
              "Cost",
              "Avg cost/call",
            ]}
            rows={models.map((model) => [
              model.provider,
              model.model,
              number(model.calls),
              number(model.inputTokens),
              number(model.outputTokens),
              money(model.costUsd),
              money(model.avgCostPerCall),
            ])}
          />
        </Section>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Section title="Coverage detail">
        <SimpleTable
          columns={["Exam/course", "Uploaders", "Files", "Questions", "Cost"]}
          rows={northStar.coverage.topExams.slice(0, 20).map((exam) => [
            exam.examGoal,
            number(exam.users),
            number(exam.files),
            number(exam.questions),
            money(exam.costUsd),
          ])}
        />
      </Section>
      <Section title="Exam profitability">
        <SimpleTable
          columns={[
            "Exam",
            "Users",
            "Revenue",
            "COGS",
            "Profit",
            "Margin",
            "Avg files/user",
            "Avg PU/user",
          ]}
          rows={exams.map((exam) => [
            exam.examGoal,
            number(exam.users),
            money(exam.revenueUsd),
            money(exam.cogsUsd),
            money(exam.profitUsd),
            pct(exam.marginPct),
            number(exam.avgFilesPerUser),
            number(exam.avgPuPerUser),
          ])}
        />
      </Section>
    </div>
  );
}

function MetricCard({
  active,
  facts,
  onClick,
  subtitle,
  title,
  value,
}: {
  active: boolean;
  facts: MetricFact[];
  onClick: () => void;
  subtitle: string;
  title: string;
  value: string;
}) {
  return (
    <button
      className={`rounded-lg border p-4 text-left transition hover:border-emerald-300/70 ${
        active ? "border-emerald-300/70 bg-emerald-300/10" : "border-white/10 bg-white/[0.04]"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="text-xs font-medium uppercase text-zinc-500">{title}</div>
      <div className="mt-2 font-mono text-3xl font-semibold text-zinc-100">{value}</div>
      <p className="mt-2 min-h-10 text-sm leading-5 text-zinc-400">{subtitle}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {facts.map((item) => (
          <div className="rounded-md border border-white/10 bg-zinc-950/45 p-2" key={item.label}>
            <div className="text-[11px] font-medium uppercase text-zinc-500">
              {item.label}
            </div>
            <div className="mt-1 truncate font-mono text-sm text-zinc-100">{item.value}</div>
            {typeof item.change === "number" ? (
              <div className={`mt-1 text-[11px] ${changeClass(item.change)}`}>
                {changeLabel(item.change)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </button>
  );
}

function Kpi({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-300"
          : "text-zinc-100";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs font-medium uppercase text-zinc-500">{title}</div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function fact(label: string, value: string, change?: number): MetricFact {
  return { label, value, change };
}

function toggleDetail(
  key: DetailKey,
  activeDetail: DetailKey | null,
  setActiveDetail: (key: DetailKey | null) => void,
) {
  setActiveDetail(activeDetail === key ? null : key);
}

function growthRow(
  label: string,
  windows: {
    day: { count: number; pctChange: number };
    week: { count: number; pctChange: number };
    month: { count: number; pctChange: number };
  },
) {
  return [
    label,
    number(windows.day.count),
    changeLabel(windows.day.pctChange),
    number(windows.week.count),
    changeLabel(windows.week.pctChange),
    number(windows.month.count),
    changeLabel(windows.month.pctChange),
  ];
}

function costRow(
  label: string,
  windows: {
    day: { costUsd: number; pctChange: number };
    week: { costUsd: number; pctChange: number };
    month: { costUsd: number; pctChange: number };
  },
) {
  return [
    label,
    money(windows.day.costUsd),
    changeLabel(windows.day.pctChange),
    money(windows.week.costUsd),
    changeLabel(windows.week.pctChange),
    money(windows.month.costUsd),
    changeLabel(windows.month.pctChange),
  ];
}

function changeLabel(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function changeClass(value: number) {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-zinc-500";
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SimpleTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase text-zinc-500">
            {columns.map((column) => (
              <th className="px-3 py-2 font-medium" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-zinc-500" colSpan={columns.length}>
                No data yet
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr className="border-b border-white/5 align-top" key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    className="max-w-[280px] truncate px-3 py-2"
                    key={`${rowIndex}-${cellIndex}`}
                    title={String(cell)}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
