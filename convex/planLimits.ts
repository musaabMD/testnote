export type AppPlan = "free" | "starter" | "pro" | "school";

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "none";

export type AiFeature = "extract" | "ask" | "tutor" | "grammar" | "ocr";

export type PlanLimits = {
  plan: AppPlan;
  monthlyAiBudgetUsd: number;
  monthlyCredits: number;
  monthlyPageLimit: number;
  monthlyUploadLimit: number;
  monthlyFileLimit: number;
  chatMessagesPerDay: number;
  monthlyChatLimit: number;
  maxUploadBytes: number;
  maxFileSizeBytes: number;
  maxPagesPerFile: number;
  maxActiveExtractionJobs: number;
  activeJobLimit: number;
  activeExtractionLimit: number;
  warnAiBudgetUsd: number;
};

export const CREDIT_COST = {
  page: 10,
  chat: 5,
  file: 100,
} as const;

export function creditsUsedFromUsage(args: {
  pagesProcessed: number;
  chatMessages: number;
  filesUploaded: number;
}) {
  return (
    args.pagesProcessed * CREDIT_COST.page +
    args.chatMessages * CREDIT_COST.chat +
    args.filesUploaded * CREDIT_COST.file
  );
}

const PLAN_LIMITS: Record<AppPlan, PlanLimits> = {
  free: {
    plan: "free",
    monthlyAiBudgetUsd: 0,
    monthlyCredits: 1000,
    monthlyPageLimit: 100,
    monthlyUploadLimit: 3,
    monthlyFileLimit: 3,
    chatMessagesPerDay: 20,
    monthlyChatLimit: 600,
    maxUploadBytes: 20 * 1024 * 1024,
    maxFileSizeBytes: 20 * 1024 * 1024,
    maxPagesPerFile: 50,
    maxActiveExtractionJobs: 1,
    activeJobLimit: 1,
    activeExtractionLimit: 1,
    warnAiBudgetUsd: 0,
  },
  starter: {
    plan: "starter",
    monthlyAiBudgetUsd: 2,
    monthlyCredits: 5000,
    monthlyPageLimit: 2000,
    monthlyUploadLimit: 20,
    monthlyFileLimit: 20,
    chatMessagesPerDay: 100,
    monthlyChatLimit: 3000,
    maxUploadBytes: 100 * 1024 * 1024,
    maxFileSizeBytes: 100 * 1024 * 1024,
    maxPagesPerFile: 300,
    maxActiveExtractionJobs: 2,
    activeJobLimit: 2,
    activeExtractionLimit: 2,
    warnAiBudgetUsd: 1.5,
  },
  pro: {
    plan: "pro",
    monthlyAiBudgetUsd: 8,
    monthlyCredits: 15_000,
    monthlyPageLimit: 10_000,
    monthlyUploadLimit: 100,
    monthlyFileLimit: 100,
    chatMessagesPerDay: 500,
    monthlyChatLimit: 15_000,
    maxUploadBytes: 250 * 1024 * 1024,
    maxFileSizeBytes: 250 * 1024 * 1024,
    maxPagesPerFile: 2000,
    maxActiveExtractionJobs: 4,
    activeJobLimit: 4,
    activeExtractionLimit: 4,
    warnAiBudgetUsd: 6,
  },
  school: {
    plan: "school",
    monthlyAiBudgetUsd: 50,
    monthlyCredits: 50_000,
    monthlyPageLimit: 100_000,
    monthlyUploadLimit: 500,
    monthlyFileLimit: 500,
    chatMessagesPerDay: 2000,
    monthlyChatLimit: 60_000,
    maxUploadBytes: 500 * 1024 * 1024,
    maxFileSizeBytes: 500 * 1024 * 1024,
    maxPagesPerFile: 5000,
    maxActiveExtractionJobs: 8,
    activeJobLimit: 8,
    activeExtractionLimit: 8,
    warnAiBudgetUsd: 40,
  },
};

export function normalizeAppPlan(plan: string | undefined | null): AppPlan {
  if (plan === "starter" || plan === "pro" || plan === "school") return plan;
  if (plan === "basic") return "free";
  return "free";
}

export function getPlanLimits(plan: string | undefined | null): PlanLimits {
  return PLAN_LIMITS[normalizeAppPlan(plan)];
}

export function getCurrentPeriodBounds(now = Date.now()) {
  const date = new Date(now);
  const periodStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const periodEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { periodStart, periodEnd };
}

export function estimateExtractionCostUsd(args: {
  pageCount: number;
  batchCount: number;
  model: string;
}): number {
  const model = args.model.toLowerCase();
  const perBatch = model.includes("flash-lite")
    ? 0.0008
    : model.includes("flash")
      ? 0.002
      : 0.006;
  const base = Math.max(1, args.batchCount) * perBatch;
  const pageFactor = Math.min(args.pageCount, 2000) / 1000;
  return base * (1 + pageFactor * 0.25);
}

export function reserveCostUsd(estimatedCostUsd: number): number {
  return estimatedCostUsd * 1.5;
}

export function estimateChatCostUsd(model: string): number {
  return model.includes("flash") ? 0.001 : 0.004;
}
