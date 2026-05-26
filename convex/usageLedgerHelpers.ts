import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getCurrentPeriodBounds,
  getPlanLimits,
  creditsUsedFromUsage,
  type PlanLimits,
} from "./planLimits";

function assertUsageSecret(secret: string) {
  const expected =
    process.env.USAGE_LEDGER_SECRET ?? process.env.EXTRACTION_STORAGE_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized usage ledger request.");
  }
}

async function getOrCreateUserByClerkId(
  ctx: MutationCtx,
  clerkUserId: string,
): Promise<Doc<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();

  if (existing) return existing;

  const now = Date.now();
  const limits = getPlanLimits("free");
  const userId = await ctx.db.insert("users", {
    clerkUserId,
    externalId: clerkUserId,
    plan: "free",
    billingStatus: "none",
    monthlyAiBudgetUsd: limits.monthlyAiBudgetUsd,
    monthlyPageLimit: limits.monthlyPageLimit,
    monthlyUploadLimit: limits.monthlyUploadLimit,
    monthlyFileLimit: limits.monthlyFileLimit,
    monthlyChatLimit: limits.monthlyChatLimit,
    activeJobLimit: limits.activeJobLimit,
    activeExtractionLimit: limits.activeExtractionLimit,
    maxPagesPerFile: limits.maxPagesPerFile,
    maxFileSizeBytes: limits.maxFileSizeBytes,
    creditsRemaining: limits.monthlyCredits,
    monthlyCredits: limits.monthlyCredits,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ctx.db.get(userId);
  if (!created) throw new Error("Failed to create user.");
  return created;
}

async function getUserByClerkId(ctx: QueryCtx, clerkUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

async function getOrCreateUsagePeriod(ctx: MutationCtx | QueryCtx, userId: Id<"users">) {
  const { periodStart, periodEnd } = getCurrentPeriodBounds();
  const existing = await ctx.db
    .query("usagePeriods")
    .withIndex("by_user_period", (q) =>
      q.eq("userId", userId).eq("periodStart", periodStart),
    )
    .unique();

  if (existing) return existing;

  const now = Date.now();
  const periodId = await (ctx as MutationCtx).db.insert("usagePeriods", {
    userId,
    periodStart,
    periodEnd,
    aiCostUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    pagesProcessed: 0,
    filesUploaded: 0,
    extractionJobs: 0,
    chatMessages: 0,
    updatedAt: now,
  });

  const created = await ctx.db.get(periodId);
  if (!created) throw new Error("Failed to create usage period.");
  return created;
}

function getEffectiveUserLimits(user: Doc<"users">): PlanLimits {
  const defaults = getPlanLimits(user.plan);
  return {
    ...defaults,
    monthlyAiBudgetUsd: user.monthlyAiBudgetUsd ?? defaults.monthlyAiBudgetUsd,
    monthlyPageLimit: user.monthlyPageLimit ?? defaults.monthlyPageLimit,
    monthlyUploadLimit:
      user.monthlyFileLimit ?? user.monthlyUploadLimit ?? defaults.monthlyUploadLimit,
    monthlyFileLimit:
      user.monthlyFileLimit ?? user.monthlyUploadLimit ?? defaults.monthlyFileLimit,
    monthlyChatLimit: user.monthlyChatLimit ?? defaults.monthlyChatLimit,
    maxUploadBytes: user.maxFileSizeBytes ?? defaults.maxUploadBytes,
    maxFileSizeBytes: user.maxFileSizeBytes ?? defaults.maxFileSizeBytes,
    maxPagesPerFile: user.maxPagesPerFile ?? defaults.maxPagesPerFile,
    maxActiveExtractionJobs:
      user.activeExtractionLimit ??
      user.activeJobLimit ??
      defaults.maxActiveExtractionJobs,
    activeJobLimit:
      user.activeExtractionLimit ?? user.activeJobLimit ?? defaults.activeJobLimit,
    activeExtractionLimit:
      user.activeExtractionLimit ??
      user.activeJobLimit ??
      defaults.activeExtractionLimit,
  };
}

function hasPaidPlan(user: Doc<"users">): boolean {
  return user.plan !== "free" && user.billingStatus === "active";
}

function isBillingActive(status: string | undefined): boolean {
  // Only paid subscriptions with active billing may use AI. No free tier.
  return status === "active";
}

async function sumActiveReservations(ctx: MutationCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("quotaReservations")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "reserved"))
    .collect();

  const now = Date.now();
  let total = 0;
  for (const row of rows) {
    if (row.expiresAt < now) continue;
    total += row.estimatedCostUsd;
  }
  return total;
}

async function countTodayChatMessages(ctx: MutationCtx, userId: Id<"users">) {
  const todayStart = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );

  const events = await ctx.db
    .query("aiUsageEvents")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .filter((q) => q.gte(q.field("createdAt"), todayStart))
    .collect();

  return events.filter((event) => event.feature === "ask" || event.feature === "tutor")
    .length;
}

export {
  assertUsageSecret,
  creditsUsedFromUsage,
  getEffectiveUserLimits,
  getOrCreateUserByClerkId,
  getOrCreateUsagePeriod,
  getUserByClerkId,
  hasPaidPlan,
  isBillingActive,
  sumActiveReservations,
  countTodayChatMessages,
};
