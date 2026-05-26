import { v } from "convex/values";
import { getCurrentPeriodBounds, getPlanLimits, normalizeAppPlan } from "./planLimits";
import { isAdminUser } from "./adminAccess";
import {
  assertUsageSecret,
  countTodayChatMessages,
  getEffectiveUserLimits,
  getOrCreateUserByClerkId,
  getOrCreateUsagePeriod,
  hasPaidPlan,
  isBillingActive,
  sumActiveReservations,
} from "./usageLedgerHelpers";
import { mutation, query } from "./_generated/server";

export const preflightAiUsage = mutation({
  args: {
    secret: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    feature: v.union(
      v.literal("extract"),
      v.literal("ask"),
      v.literal("tutor"),
      v.literal("grammar"),
      v.literal("ocr"),
    ),
    estimatedCostUsd: v.number(),
    estimatedPages: v.optional(v.number()),
    fileSizeBytes: v.optional(v.number()),
    jobId: v.optional(v.string()),
    model: v.optional(v.string()),
    reserve: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const shouldReserve = args.reserve ?? true;
    assertUsageSecret(args.secret);

    const user = await getOrCreateUserByClerkId(ctx, args.clerkUserId, args.email);
    const admin = isAdminUser({
      clerkUserId: args.clerkUserId,
      email: args.email,
    });

    if (admin) {
      return {
        allowed: true,
        plan: normalizeAppPlan(user.plan),
      };
    }

    if (!hasPaidPlan(user)) {
      return {
        allowed: false,
        reason: "A paid plan is required to use AI features. Upgrade at /pricing.",
      };
    }

    if (!isBillingActive(user.billingStatus ?? "none")) {
      return {
        allowed: false,
        reason: "Subscription inactive. Update billing to continue.",
      };
    }

    const limits = getEffectiveUserLimits(user);
    const period = await getOrCreateUsagePeriod(ctx, user._id);

    const reservedTotal = await sumActiveReservations(ctx, user._id);
    const projectedCost = period.aiCostUsd + reservedTotal + args.estimatedCostUsd;
    const currentBudgetRatio =
      limits.monthlyAiBudgetUsd > 0 ? period.aiCostUsd / limits.monthlyAiBudgetUsd : 0;
    const projectedBudgetRatio =
      limits.monthlyAiBudgetUsd > 0 ? projectedCost / limits.monthlyAiBudgetUsd : 0;
    const budgetWarningThreshold =
      currentBudgetRatio < 0.9 && projectedBudgetRatio >= 0.9
        ? 90
        : currentBudgetRatio < 0.75 && projectedBudgetRatio >= 0.75
          ? 75
          : null;

    if (projectedCost > limits.monthlyAiBudgetUsd) {
      return {
        allowed: false,
        reason: `Monthly AI budget reached ($${limits.monthlyAiBudgetUsd.toFixed(2)}).`,
        warnBudget: period.aiCostUsd >= limits.warnAiBudgetUsd,
      };
    }

    if (budgetWarningThreshold) {
      await ctx.db.insert("appAuditEvents", {
        userId: args.clerkUserId,
        eventType:
          budgetWarningThreshold === 90 ? "budget_warning_90" : "budget_warning_75",
        feature: args.feature,
        fileHash: undefined,
        questionId: undefined,
        jobId: args.jobId,
        reason: `Monthly AI budget is at least ${budgetWarningThreshold}% used.`,
        metadata: {
          estimatedCostUsd: args.estimatedCostUsd,
          projectedCostUsd: projectedCost,
          monthlyAiBudgetUsd: limits.monthlyAiBudgetUsd,
          projectedBudgetRatio,
          model: args.model,
        },
        createdAt: Date.now(),
      });
    }

    if (args.feature === "extract") {
      const pages = args.estimatedPages ?? 0;
      if (args.fileSizeBytes && args.fileSizeBytes > limits.maxFileSizeBytes) {
        return {
          allowed: false,
          reason: `File is too large for this plan.`,
        };
      }
      if (pages > limits.maxPagesPerFile) {
        return {
          allowed: false,
          reason: `File page count exceeds this plan limit (${limits.maxPagesPerFile} pages per file).`,
        };
      }
      if (period.pagesProcessed + pages > limits.monthlyPageLimit) {
        return {
          allowed: false,
          reason: `Monthly page limit reached (${limits.monthlyPageLimit} pages).`,
        };
      }
      if (period.filesUploaded >= limits.monthlyFileLimit) {
        return {
          allowed: false,
          reason: `Monthly upload limit reached (${limits.monthlyFileLimit} files).`,
        };
      }

      const activeJobs = await ctx.db
        .query("quotaReservations")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "reserved"),
        )
        .collect();

      const extractJobs = activeJobs.filter((row) => row.feature === "extract");
      if (extractJobs.length >= limits.activeExtractionLimit) {
        return {
          allowed: false,
          reason: `Too many active extraction jobs (max ${limits.activeExtractionLimit}).`,
        };
      }
    }

    if (args.feature === "ask" || args.feature === "tutor") {
      const todayMessages = await countTodayChatMessages(ctx, user._id);
      if (period.chatMessages >= limits.monthlyChatLimit) {
        return {
          allowed: false,
          reason: `Monthly chat limit reached (${limits.monthlyChatLimit} messages).`,
        };
      }
      if (todayMessages >= limits.chatMessagesPerDay) {
        return {
          allowed: false,
          reason: `Daily chat limit reached (${limits.chatMessagesPerDay} messages).`,
        };
      }
    }

    if (!shouldReserve) {
      return {
        allowed: true,
        warnBudget: period.aiCostUsd >= limits.warnAiBudgetUsd,
        budgetWarningThreshold,
        plan: normalizeAppPlan(user.plan),
      };
    }

    const reservationId = await ctx.db.insert("quotaReservations", {
      userId: user._id,
      jobId: args.jobId,
      feature: args.feature,
      estimatedCostUsd: args.estimatedCostUsd,
      estimatedPages: args.estimatedPages,
      status: "reserved",
      expiresAt: Date.now() + 15 * 60 * 1000,
      createdAt: Date.now(),
    });

    return {
      allowed: true,
      reservationId,
      warnBudget: period.aiCostUsd >= limits.warnAiBudgetUsd,
      budgetWarningThreshold,
      plan: normalizeAppPlan(user.plan),
    };
  },
});

export const commitAiUsage = mutation({
  args: {
    secret: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    reservationId: v.optional(v.id("quotaReservations")),
    feature: v.union(
      v.literal("extract"),
      v.literal("ask"),
      v.literal("tutor"),
      v.literal("grammar"),
      v.literal("ocr"),
    ),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    costUsd: v.number(),
    openRouterGenerationId: v.optional(v.string()),
    jobId: v.optional(v.string()),
    fileHash: v.optional(v.string()),
    pagesProcessed: v.optional(v.number()),
    status: v.union(
      v.literal("estimated"),
      v.literal("final"),
      v.literal("failed"),
      v.literal("refunded"),
    ),
    cached: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);

    const user = await getOrCreateUserByClerkId(ctx, args.clerkUserId, args.email);
    const period = await getOrCreateUsagePeriod(ctx, user._id);
    const now = Date.now();

    await ctx.db.insert("aiUsageEvents", {
      userId: user._id,
      jobId: args.jobId,
      fileHash: args.fileHash,
      feature: args.feature,
      provider: "openrouter",
      model: args.model,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      totalTokens: args.totalTokens,
      costUsd: args.costUsd,
      openRouterGenerationId: args.openRouterGenerationId,
      cached: args.cached,
      status: args.status,
      createdAt: now,
    });

    await ctx.db.insert("costLedger", {
      userId: args.clerkUserId,
      fileId: args.fileHash,
      jobId: args.jobId,
      category: "ai",
      provider: "openrouter",
      model: args.model,
      inputTokens: args.promptTokens,
      outputTokens: args.completionTokens,
      units: args.totalTokens,
      unitCostUsd: args.totalTokens > 0 ? args.costUsd / args.totalTokens : args.costUsd,
      costUsd: args.costUsd,
      metadata: {
        feature: args.feature,
        openRouterGenerationId: args.openRouterGenerationId,
        cached: args.cached,
        status: args.status,
      },
      createdAt: now,
    });

    await ctx.db.patch(period._id, {
      aiCostUsd: period.aiCostUsd + args.costUsd,
      promptTokens: period.promptTokens + args.promptTokens,
      completionTokens: period.completionTokens + args.completionTokens,
      totalTokens: (period.totalTokens ?? 0) + args.totalTokens,
      pagesProcessed:
        period.pagesProcessed +
        (args.feature === "extract" ? (args.pagesProcessed ?? 0) : 0),
      filesUploaded: period.filesUploaded + (args.feature === "extract" ? 1 : 0),
      extractionJobs: period.extractionJobs + (args.feature === "extract" ? 1 : 0),
      chatMessages:
        period.chatMessages +
        (args.feature === "ask" || args.feature === "tutor" ? 1 : 0),
      updatedAt: now,
    });

    if (args.reservationId) {
      await ctx.db.patch(args.reservationId, { status: "committed" });
    }

    return { ok: true };
  },
});

export const releaseQuotaReservation = mutation({
  args: {
    secret: v.string(),
    reservationId: v.id("quotaReservations"),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);
    await ctx.db.patch(args.reservationId, { status: "released" });
    return { ok: true };
  },
});

export const setUserPlanByClerkId = mutation({
  args: {
    secret: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    plan: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("school"),
    ),
    billingStatus: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("none"),
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);

    const user = await getOrCreateUserByClerkId(ctx, args.clerkUserId, args.email);
    const limits = getPlanLimits(args.plan);

    await ctx.db.patch(user._id, {
      plan: args.plan,
      billingStatus: args.billingStatus,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      monthlyAiBudgetUsd: limits.monthlyAiBudgetUsd,
      monthlyPageLimit: limits.monthlyPageLimit,
      monthlyUploadLimit: limits.monthlyUploadLimit,
      monthlyFileLimit: limits.monthlyFileLimit,
      monthlyChatLimit: limits.monthlyChatLimit,
      activeJobLimit: limits.activeJobLimit,
      activeExtractionLimit: limits.activeExtractionLimit,
      maxPagesPerFile: limits.maxPagesPerFile,
      maxFileSizeBytes: limits.maxFileSizeBytes,
      monthlyCredits: limits.monthlyCredits,
      creditsRemaining: limits.monthlyCredits,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const getUsageSummary = query({
  args: {
    secret: v.string(),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (!user) return null;

    const { periodStart } = (await import("./planLimits")).getCurrentPeriodBounds();
    const period =
      (await ctx.db
        .query("usagePeriods")
        .withIndex("by_user_period", (q) =>
          q.eq("userId", user._id).eq("periodStart", periodStart),
        )
        .unique()) ?? null;

    const limits = getEffectiveUserLimits(user);

    return {
      plan: normalizeAppPlan(user.plan),
      billingStatus: user.billingStatus ?? "none",
      limits,
      period,
    };
  },
});

export const getInternalCostReport = query({
  args: {
    secret: v.string(),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);

    const periodBounds = getCurrentPeriodBounds();
    const periodStart = args.periodStart ?? periodBounds.periodStart;
    const periodEnd = args.periodEnd ?? periodBounds.periodEnd;
    const planRevenueUsd = parsePlanRevenueMap();

    const [users, periods, events, extractionRecords, auditEvents] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("usagePeriods").collect(),
      ctx.db.query("aiUsageEvents").collect(),
      ctx.db.query("pdfExtractionRecords").collect(),
      ctx.db.query("appAuditEvents").collect(),
    ]);

    const usersById = new Map(users.map((user) => [user._id, user]));
    const currentPeriods = periods.filter(
      (period) => period.periodStart >= periodStart && period.periodStart < periodEnd,
    );
    const currentEvents = events.filter(
      (event) => event.createdAt >= periodStart && event.createdAt < periodEnd,
    );
    const currentAuditEvents = auditEvents.filter(
      (event) => event.createdAt >= periodStart && event.createdAt < periodEnd,
    );
    const mcqCountByFileHash = new Map<string, number>();
    for (const record of extractionRecords) {
      if (record.createdAt < periodStart || record.createdAt >= periodEnd) continue;
      mcqCountByFileHash.set(record.fileHash, Array.isArray(record.mcqs) ? record.mcqs.length : 0);
    }

    const costByFeature: Record<string, number> = {};
    const costByModel: Record<string, number> = {};
    const fileStats: Record<
      string,
      {
        costUsd: number;
        paidExtractionEvents: number;
        cachedEvents: number;
        mcqCount: number;
      }
    > = {};
    let cachedEvents = 0;
    let totalEvents = 0;
    const auditEventCounts: Record<string, number> = {};

    for (const event of currentEvents) {
      totalEvents += 1;
      costByFeature[event.feature] = (costByFeature[event.feature] ?? 0) + event.costUsd;
      costByModel[event.model] = (costByModel[event.model] ?? 0) + event.costUsd;
      if (event.cached) cachedEvents += 1;

      if (event.fileHash) {
        const file = fileStats[event.fileHash] ?? {
          costUsd: 0,
          paidExtractionEvents: 0,
          cachedEvents: 0,
          mcqCount: mcqCountByFileHash.get(event.fileHash) ?? 0,
        };
        file.costUsd += event.costUsd;
        if (event.cached) file.cachedEvents += 1;
        if (event.feature === "extract" && event.costUsd > 0) {
          file.paidExtractionEvents += 1;
        }
        fileStats[event.fileHash] = file;
      }
    }

    for (const event of currentAuditEvents) {
      auditEventCounts[event.eventType] = (auditEventCounts[event.eventType] ?? 0) + 1;
    }

    const usersReport = currentPeriods.map((period) => {
      const user = usersById.get(period.userId);
      const plan = normalizeAppPlan(user?.plan);
      const limits = user ? getEffectiveUserLimits(user) : getPlanLimits(plan);
      const revenueUsd = planRevenueUsd[plan];
      const costToRevenueRatio =
        typeof revenueUsd === "number" && revenueUsd > 0
          ? period.aiCostUsd / revenueUsd
          : null;
      const marginFlag =
        period.aiCostUsd >= limits.monthlyAiBudgetUsd
          ? "block"
          : costToRevenueRatio === null
            ? "unknown"
            : costToRevenueRatio > 0.35
              ? "danger"
              : costToRevenueRatio > 0.25
                ? "warning"
                : "ok";

      return {
        userId: period.userId,
        clerkUserId: user?.clerkUserId,
        email: user?.email,
        plan,
        billingStatus: user?.billingStatus ?? "none",
        aiCostUsd: period.aiCostUsd,
        planRevenueUsd: revenueUsd ?? null,
        costToRevenueRatio,
        marginFlag,
        monthlyAiBudgetUsd: limits.monthlyAiBudgetUsd,
        pagesProcessed: period.pagesProcessed,
        filesUploaded: period.filesUploaded,
        chatMessages: period.chatMessages,
        promptTokens: period.promptTokens,
        completionTokens: period.completionTokens,
        totalTokens: period.totalTokens ?? period.promptTokens + period.completionTokens,
      };
    });

    const duplicateChargedFiles = Object.entries(fileStats)
      .filter(([, file]) => file.paidExtractionEvents > 1)
      .map(([fileHash, file]) => ({
        fileHash,
        paidExtractionEvents: file.paidExtractionEvents,
        costUsd: file.costUsd,
      }));

    const totalCostUsd = currentEvents.reduce((sum, event) => sum + event.costUsd, 0);
    const totalPages = currentPeriods.reduce((sum, period) => sum + period.pagesProcessed, 0);
    const totalMcqs = Array.from(mcqCountByFileHash.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      periodStart,
      periodEnd,
      totals: {
        costUsd: totalCostUsd,
        users: usersReport.length,
        events: totalEvents,
        cacheHitRate: totalEvents ? cachedEvents / totalEvents : 0,
        costPerPage: totalPages ? totalCostUsd / totalPages : null,
        costPerMcq: totalMcqs ? totalCostUsd / totalMcqs : null,
        quotaFailures: auditEventCounts.quota_exceeded ?? 0,
        rateLimitedEvents: auditEventCounts.rate_limited ?? 0,
        sourceFailures:
          (auditEventCounts.source_not_ready ?? 0) +
          (auditEventCounts.source_payload_missing ?? 0) +
          (auditEventCounts.source_region_invalid ?? 0) +
          (auditEventCounts.source_image_load_failed ?? 0),
        duplicateExtractionAttempts:
          (auditEventCounts.duplicate_extraction_owner ?? 0) +
          (auditEventCounts.duplicate_extraction_waiter ?? 0),
      },
      costByFeature,
      costByModel,
      costByFile: fileStats,
      auditEventCounts,
      duplicateChargedFiles,
      lowMarginUsers: usersReport.filter(
        (user) => user.marginFlag === "warning" || user.marginFlag === "danger",
      ),
      blockedBudgetUsers: usersReport.filter((user) => user.marginFlag === "block"),
      users: usersReport,
      notes: {
        auditEvents:
          "quota, rate-limit, duplicate extraction, and source failure signals are persisted in appAuditEvents.",
        revenue:
          "Revenue comparison uses PLAN_REVENUE_USD_MAP only. If absent, marginFlag is unknown unless AI budget is reached.",
      },
    };
  },
});

function parsePlanRevenueMap(): Partial<Record<ReturnType<typeof normalizeAppPlan>, number>> {
  const raw = process.env.PLAN_REVENUE_USD_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Partial<Record<ReturnType<typeof normalizeAppPlan>, number>> = {};
    for (const [plan, value] of Object.entries(parsed)) {
      const normalizedPlan = normalizeAppPlan(plan);
      const numericValue =
        typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (Number.isFinite(numericValue) && numericValue > 0) {
        result[normalizedPlan] = numericValue;
      }
    }
    return result;
  } catch (error) {
    console.warn("[usage-ledger] invalid PLAN_REVENUE_USD_MAP", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}
