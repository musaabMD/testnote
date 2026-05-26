import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentPeriodBounds, getPlanLimits, normalizeAppPlan } from "./planLimits";
import {
  creditsUsedFromUsage,
  getEffectiveUserLimits,
  getUserByClerkId,
} from "./usageLedgerHelpers";

const planLabel = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  school: "School",
} as const;

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await getUserByClerkId(ctx, identity.subject);
  },
});

export const getMyUsageDashboard = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      plan: v.string(),
      planLabel: v.string(),
      creditsRemaining: v.number(),
      creditsAllowance: v.number(),
      streak: v.number(),
      usage: v.object({
        filesUploaded: v.number(),
        filesLimit: v.number(),
        pagesProcessed: v.number(),
        pagesLimit: v.number(),
        chatMessages: v.number(),
        chatLimit: v.number(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await getUserByClerkId(ctx, identity.subject);
    const plan = normalizeAppPlan(user?.plan);
    const limits = user ? getEffectiveUserLimits(user) : getPlanLimits(plan);
    const allowance = user?.monthlyCredits ?? limits.monthlyCredits;

    const period = user
      ? await ctx.db
          .query("usagePeriods")
          .withIndex("by_user_period", (q) =>
            q
              .eq("userId", user._id)
              .eq("periodStart", getCurrentPeriodBounds().periodStart),
          )
          .unique()
      : null;

    const usedCredits = period
      ? creditsUsedFromUsage({
          pagesProcessed: period.pagesProcessed,
          chatMessages: period.chatMessages,
          filesUploaded: period.filesUploaded,
        })
      : 0;

    return {
      plan,
      planLabel: planLabel[plan],
      creditsRemaining: Math.max(0, allowance - usedCredits),
      creditsAllowance: allowance,
      streak: user?.streak ?? 0,
      usage: {
        filesUploaded: period?.filesUploaded ?? 0,
        filesLimit: limits.monthlyFileLimit,
        pagesProcessed: period?.pagesProcessed ?? 0,
        pagesLimit: limits.monthlyPageLimit,
        chatMessages: period?.chatMessages ?? 0,
        chatLimit: limits.monthlyChatLimit,
      },
    };
  },
});

export const upsertCurrent = mutation({
  args: {
    dailyQuestionGoal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated.");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    const now = Date.now();
    const patch = {
      externalId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      email: identity.email,
      name: identity.name,
      updatedAt: now,
      ...(args.dailyQuestionGoal === undefined
        ? {}
        : { dailyQuestionGoal: args.dailyQuestionGoal }),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const limits = getPlanLimits("free");

    return await ctx.db.insert("users", {
      ...patch,
      dailyQuestionGoal: args.dailyQuestionGoal ?? 20,
      streak: 0,
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
    });
  },
});

function utcDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function previousUtcDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month!, day!));
  date.setUTCDate(date.getUTCDate() - 1);
  return utcDayKey(date.getTime());
}

export const recordStudyActivity = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const user = await getUserByClerkId(ctx, identity.subject);
    if (!user) return 0;

    const today = utcDayKey();
    if (user.lastStudyDay === today) {
      return user.streak ?? 0;
    }

    const streak =
      user.lastStudyDay === previousUtcDayKey(today)
        ? (user.streak ?? 0) + 1
        : 1;

    await ctx.db.patch(user._id, {
      streak,
      lastStudyDay: today,
      updatedAt: Date.now(),
    });

    return streak;
  },
});
