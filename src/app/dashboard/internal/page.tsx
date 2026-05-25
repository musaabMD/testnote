import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Internal Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

type InternalReport = {
  periodStart: number;
  periodEnd: number;
  totals: Record<string, unknown>;
  auditEventCounts: Record<string, number>;
  duplicateChargedFiles: Array<Record<string, unknown>>;
  lowMarginUsers: Array<Record<string, unknown>>;
  blockedBudgetUsers: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
};

type AuditEventRow = {
  _id: string;
  eventType: string;
  feature?: string;
  userId?: string;
  fileHash?: string;
  questionId?: string;
  jobId?: string;
  reason?: string;
  metadata?: unknown;
  createdAt: number;
};

const AUDIT_EVENT_FILTERS = [
  "quota_exceeded",
  "rate_limited",
  "source_not_ready",
  "source_payload_missing",
  "source_region_invalid",
  "source_image_load_failed",
  "duplicate_extraction_waiter",
  "duplicate_extraction_owner",
  "openrouter_call_blocked",
  "budget_warning_75",
  "budget_warning_90",
] as const;

type AuditEventFilter = (typeof AUDIT_EVENT_FILTERS)[number];

export default async function InternalDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ eventType?: string; token?: string }>;
}) {
  const params = await searchParams;
  const configuredToken = process.env.INTERNAL_DASHBOARD_TOKEN;

  if (!configuredToken) {
    return <InternalShell title="Internal dashboard is not configured" />;
  }

  if (params.token !== configuredToken) {
    return <InternalShell title="Not authorized" />;
  }

  const eventType = parseAuditEventFilter(params.eventType);
  const [report, auditEvents] = await Promise.all([
    getInternalReport(),
    getRecentAuditEvents(eventType),
  ]);
  if (!report) {
    return (
      <InternalShell
        title="Cost report unavailable"
        description="Set NEXT_PUBLIC_CONVEX_URL and EXTRACTION_STORAGE_SECRET so the dashboard can read usage and audit data."
      />
    );
  }

  const totals = report.totals;
  const usersNeedingReview = [
    ...report.blockedBudgetUsers,
    ...report.lowMarginUsers,
  ].slice(0, 12);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              Internal
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Operator dashboard
            </h1>
          </div>
          <p className="text-sm text-slate-400">
            {formatDate(report.periodStart)} to {formatDate(report.periodEnd)}
          </p>
        </div>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="AI cost" value={formatUsd(totals.costUsd)} />
          <Metric label="Events" value={formatNumber(totals.events)} />
          <Metric label="Cache hit rate" value={formatPct(totals.cacheHitRate)} />
          <Metric label="Quota failures" value={formatNumber(totals.quotaFailures)} />
          <Metric
            label="Duplicate attempts"
            value={formatNumber(totals.duplicateExtractionAttempts)}
          />
          <Metric label="Source failures" value={formatNumber(totals.sourceFailures)} />
          <Metric label="Cost per page" value={formatUsd(totals.costPerPage)} />
          <Metric label="Cost per MCQ" value={formatUsd(totals.costPerMcq)} />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Users needing review">
            <DataTable
              columns={["email", "plan", "aiCostUsd", "costToRevenueRatio", "marginFlag"]}
              rows={usersNeedingReview}
            />
          </Panel>

          <Panel title="Audit events">
            <div className="space-y-2">
              {Object.entries(report.auditEventCounts).map(([event, count]) => (
                <div
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
                  key={event}
                >
                  <span className="text-slate-300">{event}</span>
                  <span className="font-mono text-slate-100">{count}</span>
                </div>
              ))}
              {!Object.keys(report.auditEventCounts).length ? (
                <p className="text-sm text-slate-500">No audit events in this period.</p>
              ) : null}
            </div>
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Duplicate charged files">
            <DataTable
              columns={["fileHash", "paidExtractionEvents", "costUsd"]}
              rows={report.duplicateChargedFiles.slice(0, 12)}
            />
          </Panel>

          <Panel title="All users">
            <DataTable
              columns={["email", "plan", "billingStatus", "filesUploaded", "chatMessages"]}
              rows={report.users.slice(0, 12)}
            />
          </Panel>
        </section>

        <section className="mt-6">
          <Panel title="Audit event review">
            <AuditEventFilters
              activeEventType={eventType}
              counts={report.auditEventCounts}
              token={params.token}
            />
            <AuditEventTable rows={auditEvents} />
          </Panel>
        </section>
      </div>
    </main>
  );
}

async function getInternalReport(): Promise<InternalReport | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.EXTRACTION_STORAGE_SECRET;
  if (!convexUrl || !secret) return null;

  const client = new ConvexHttpClient(convexUrl);
  return (await client.query(api.usageLedger.getInternalCostReport, {
    secret,
  })) as InternalReport;
}

async function getRecentAuditEvents(
  eventType?: AuditEventFilter,
): Promise<AuditEventRow[]> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.EXTRACTION_STORAGE_SECRET;
  if (!convexUrl || !secret) return [];

  const client = new ConvexHttpClient(convexUrl);
  return (await client.query(api.auditEvents.listRecentAppAuditEvents, {
    secret,
    eventType,
    limit: 50,
  })) as AuditEventRow[];
}

function parseAuditEventFilter(value: string | undefined): AuditEventFilter | undefined {
  return AUDIT_EVENT_FILTERS.find((eventType) => eventType === value);
}

function InternalShell({
  title,
  description = "This page is restricted to operators.",
}: {
  title: string;
  description?: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-white">
      <div className="max-w-md text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">
          Internal
        </p>
        <h1 className="mt-4 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 font-mono text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="text-sm font-bold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">No rows to review.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
          <tr>
            {columns.map((column) => (
              <th className="border-b border-white/10 px-3 py-2" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-300">
          {rows.map((row, rowIndex) => (
            <tr className="border-b border-white/5" key={rowIndex}>
              {columns.map((column) => (
                <td className="max-w-[260px] truncate px-3 py-2" key={column}>
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditEventFilters({
  activeEventType,
  counts,
  token,
}: {
  activeEventType?: AuditEventFilter;
  counts: Record<string, number>;
  token?: string;
}) {
  const baseParams = token ? `token=${encodeURIComponent(token)}` : "";

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <AuditFilterLink
        active={!activeEventType}
        count={Object.values(counts).reduce((sum, count) => sum + count, 0)}
        href={baseParams ? `?${baseParams}` : "?"}
        label="All"
      />
      {AUDIT_EVENT_FILTERS.map((eventType) => {
        const params = new URLSearchParams();
        if (token) params.set("token", token);
        params.set("eventType", eventType);

        return (
          <AuditFilterLink
            active={activeEventType === eventType}
            count={counts[eventType] ?? 0}
            href={`?${params.toString()}`}
            key={eventType}
            label={eventType}
          />
        );
      })}
    </div>
  );
}

function AuditFilterLink({
  active,
  count,
  href,
  label,
}: {
  active: boolean;
  count: number;
  href: string;
  label: string;
}) {
  return (
    <a
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "border-sky-300 bg-sky-300 text-slate-950"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"
      }`}
      href={href}
    >
      {label}
      <span className="ml-2 font-mono opacity-70">{count}</span>
    </a>
  );
}

function AuditEventTable({ rows }: { rows: AuditEventRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">No matching audit events.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="border-b border-white/10 px-3 py-2">time</th>
            <th className="border-b border-white/10 px-3 py-2">event</th>
            <th className="border-b border-white/10 px-3 py-2">feature</th>
            <th className="border-b border-white/10 px-3 py-2">user</th>
            <th className="border-b border-white/10 px-3 py-2">file/job</th>
            <th className="border-b border-white/10 px-3 py-2">reason</th>
            <th className="border-b border-white/10 px-3 py-2">metadata</th>
          </tr>
        </thead>
        <tbody className="text-slate-300">
          {rows.map((row) => (
            <tr className="border-b border-white/5 align-top" key={row._id}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                {formatDateTime(row.createdAt)}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-100">
                {row.eventType}
              </td>
              <td className="px-3 py-2">{row.feature ?? "-"}</td>
              <td className="max-w-[180px] truncate px-3 py-2 font-mono text-xs">
                {row.userId ?? "-"}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs">
                {[row.fileHash, row.jobId, row.questionId].filter(Boolean).join(" / ") ||
                  "-"}
              </td>
              <td className="max-w-[260px] px-3 py-2">{row.reason ?? "-"}</td>
              <td className="max-w-[260px] truncate px-3 py-2 font-mono text-xs text-slate-500">
                {formatMetadata(row.metadata)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (typeof value === "number") {
    if (Math.abs(value) < 1 && value !== 0) return formatPct(value);
    return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  if (typeof value === "string") return value || "-";
  if (value === null || value === undefined) return "-";
  return JSON.stringify(value);
}

function formatUsd(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  });
}

function formatNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : "-";
}

function formatPct(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "-";
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatMetadata(value: unknown): string {
  if (value === null || value === undefined) return "-";
  const json = JSON.stringify(value);
  return json.length > 180 ? `${json.slice(0, 177)}...` : json;
}
