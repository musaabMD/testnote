import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getPlanLimits } from "./planLimits";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
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
      creditsRemaining: 0,
      monthlyCredits: 0,
      createdAt: now,
    });
  },
});
