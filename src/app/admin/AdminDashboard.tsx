"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type RangeKey = "7d" | "30d" | "90d";

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

export default function AdminDashboard() {
  const [range, setRange] = useState<RangeKey>("30d");
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
  const overview = useQuery(api.admin.getOverview, queryRange);
  const users = useQuery(
    api.admin.getUserProfitability,
    toTimestamp ? { from, to, limit: 20 } : "skip",
  );
  const files = useQuery(
    api.admin.getFileAnalytics,
    toTimestamp ? { from, to, limit: 20 } : "skip",
  );
  const exams = useQuery(api.admin.getExamAnalytics, queryRange);
  const models = useQuery(api.admin.getModelCosts, queryRange);
  const quality = useQuery(api.admin.getQualityMetrics, queryRange);

  if (!overview) {
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

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-300">
              Unit economics
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              DrNote Admin
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Revenue, COGS, profit, user ROI, file cost, model spend, and extraction quality.
            </p>
          </div>

          <label className="flex w-full max-w-xs flex-col gap-2 text-sm text-zinc-400">
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
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi title="Net revenue" value={money(overview.netRevenueUsd)} />
          <Kpi title="COGS" value={money(overview.totalCogsUsd)} tone="warn" />
          <Kpi
            title="Gross profit"
            value={money(overview.grossProfitUsd)}
            tone={overview.grossProfitUsd < 0 ? "bad" : "good"}
          />
          <Kpi title="Gross margin" value={pct(overview.grossMarginPct)} />
          <Kpi title="ROI" value={pct(overview.roiPct)} />
          <Kpi title="Paid users" value={number(overview.paidUsers)} />
          <Kpi title="Active users" value={number(overview.activeUsers)} />
          <Kpi title="Avg profit/user" value={money(overview.avgProfitPerUser)} />
          <Kpi title="Files processed" value={number(overview.filesProcessed)} />
          <Kpi title="PU used" value={number(overview.puUsed)} />
          <Kpi title="Cost/PU" value={money(overview.costPerPu)} />
          <Kpi title="Cost/question" value={money(overview.costPerQuestion)} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi title="Questions" value={number(overview.questionsCreated)} />
          <Kpi title="Avg files/user" value={number(overview.avgFilesPerUser)} />
          <Kpi title="Retry rate" value={pct(overview.retryRatePct)} />
          <Kpi title="Needs-review rate" value={pct(overview.needsReviewRatePct)} />
        </section>

        <Section title="User profitability">
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
            rows={(users ?? []).map((user) => [
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
            rows={(files ?? []).map((file) => [
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

        <div className="grid gap-6 xl:grid-cols-2">
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
              rows={(exams ?? []).map((exam) => [
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
              rows={(models ?? []).map((model) => [
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
    </main>
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
