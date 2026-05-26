import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { assertAdmin } from "./adminAuth";

const rangeArgs = {
  from: v.number(),
  to: v.number(),
};

const rangedListArgs = {
  ...rangeArgs,
  limit: v.optional(v.number()),
};

type AppUser = {
  id: string;
  clerkUserId?: string;
  email: string;
  name?: string;
  plan: string;
  examGoal?: string;
  subscriptionStatus: string;
  createdAt: number;
  lastActiveAt: number;
  monthlyPuLimit: number;
  currentMonthPu: number;
};

type CostEvent = {
  userId: string;
  fileId?: string;
  jobId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: number;
};

type FileRow = {
  fileId: string;
  userId: string;
  userEmail: string;
  originalName: string;
  examGoal?: string;
  fileType: string;
  pageCount: number;
  puCharged: number;
  questionCount: number;
  retryCount: number;
  needsReviewCount: number;
  failedPageCount: number;
  totalCostUsd: number;
  processingMs: number;
  status: string;
  startedAt: number;
};

export const getOverview = query({
  args: rangeArgs,
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const users = await getUsers(ctx);
    const billings = await getBillingRows(ctx, args.from, args.to);
    const costs = await getCostEvents(ctx, args.from, args.to);
    const files = await getFileRows(ctx, args.from, args.to, users, costs);

    const netRevenueUsd = sum(billings, (row) => row.netRevenueUsd);
    const totalCogsUsd = sum(costs, (row) => row.costUsd);
    const grossProfitUsd = netRevenueUsd - totalCogsUsd;
    const activeUsers = users.filter((user) => user.lastActiveAt >= args.from).length;
    const paidUsers = users.filter((user) =>
      ["active", "trialing"].includes(user.subscriptionStatus),
    ).length;
    const questionsCreated = sum(files, (file) => file.questionCount);
    const puUsed = sum(files, (file) => file.puCharged);
    const retryCount = sum(files, (file) => file.retryCount);
    const needsReviewCount = sum(files, (file) => file.needsReviewCount);

    return {
      totalUsers: users.length,
      paidUsers,
      freeUsers: Math.max(0, users.length - paidUsers),
      activeUsers,
      netRevenueUsd,
      totalCogsUsd,
      grossProfitUsd,
      grossMarginPct: percent(grossProfitUsd, netRevenueUsd),
      roiPct: percent(grossProfitUsd, totalCogsUsd),
      avgRevenuePerUser: divide(netRevenueUsd, activeUsers),
      avgCostPerUser: divide(totalCogsUsd, activeUsers),
      avgProfitPerUser: divide(grossProfitUsd, activeUsers),
      filesProcessed: files.length,
      avgFilesPerUser: divide(files.length, activeUsers),
      puUsed,
      costPerPu: divide(totalCogsUsd, puUsed),
      questionsCreated,
      costPerQuestion: divide(totalCogsUsd, questionsCreated),
      retryRatePct: percent(retryCount, files.length),
      needsReviewRatePct: percent(needsReviewCount, questionsCreated),
    };
  },
});

export const getUserProfitability = query({
  args: rangedListArgs,
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const users = await getUsers(ctx);
    const billings = await getBillingRows(ctx, args.from, args.to);
    const costs = await getCostEvents(ctx, args.from, args.to);
    const files = await getFileRows(ctx, args.from, args.to, users, costs);
    const limit = args.limit ?? 50;

    return users
      .map((user) => {
        const keys = userKeys(user);
        const userRevenue = sum(
          billings.filter((billing) => keys.has(billing.userId)),
          (billing) => billing.netRevenueUsd,
        );
        const userCosts = sum(
          costs.filter((cost) => keys.has(cost.userId)),
          (cost) => cost.costUsd,
        );
        const userFiles = files.filter((file) => keys.has(file.userId));
        const questionsCreated = sum(userFiles, (file) => file.questionCount);
        const retryCount = sum(userFiles, (file) => file.retryCount);
        const needsReviewCount = sum(userFiles, (file) => file.needsReviewCount);
        const puUsed = sum(userFiles, (file) => file.puCharged);
        const profitUsd = userRevenue - userCosts;
        const retryRatePct = percent(retryCount, Math.max(1, userFiles.length));
        const needsReviewRatePct = percent(needsReviewCount, questionsCreated);
        const marginPct = percent(profitUsd, userRevenue);

        return {
          userId: user.clerkUserId ?? user.id,
          email: user.email,
          plan: user.plan,
          examGoal: user.examGoal ?? null,
          subscriptionStatus: user.subscriptionStatus,
          revenueUsd: userRevenue,
          cogsUsd: userCosts,
          profitUsd,
          marginPct,
          puUsed,
          filesUploaded: userFiles.length,
          questionsCreated,
          retryRatePct,
          needsReviewRatePct,
          lastActiveAt: user.lastActiveAt,
          redFlags: getUserRedFlags({
            revenueUsd: userRevenue,
            cogsUsd: userCosts,
            profitUsd,
            marginPct,
            puUsed,
            monthlyPuLimit: user.monthlyPuLimit,
            retryRatePct,
            needsReviewRatePct,
          }),
        };
      })
      .sort((a, b) => a.profitUsd - b.profitUsd)
      .slice(0, limit);
  },
});

export const getFileAnalytics = query({
  args: rangedListArgs,
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const users = await getUsers(ctx);
    const costs = await getCostEvents(ctx, args.from, args.to);
    const files = await getFileRows(ctx, args.from, args.to, users, costs);

    return files
      .map((file) => ({
        fileId: file.fileId,
        userEmail: file.userEmail,
        originalName: file.originalName,
        examGoal: file.examGoal ?? null,
        fileType: file.fileType,
        pageCount: file.pageCount,
        puCharged: file.puCharged,
        questionCount: file.questionCount,
        retryCount: file.retryCount,
        needsReviewCount: file.needsReviewCount,
        totalCostUsd: file.totalCostUsd,
        processingMs: file.processingMs,
        status: file.status,
        redFlags: getFileRedFlags(file),
      }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
      .slice(0, args.limit ?? 50);
  },
});

export const getExamAnalytics = query({
  args: rangeArgs,
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const users = await getUsers(ctx);
    const billings = await getBillingRows(ctx, args.from, args.to);
    const costs = await getCostEvents(ctx, args.from, args.to);
    const files = await getFileRows(ctx, args.from, args.to, users, costs);
    const grouped = new Map<string, { users: Set<string>; files: FileRow[] }>();

    for (const file of files) {
      const examGoal = file.examGoal ?? "unknown";
      const group = grouped.get(examGoal) ?? { users: new Set<string>(), files: [] };
      group.users.add(file.userId);
      group.files.push(file);
      grouped.set(examGoal, group);
    }

    return Array.from(grouped.entries())
      .map(([examGoal, group]) => {
        const userIds = group.users;
        const revenueUsd = sum(
          billings.filter((billing) => userIds.has(billing.userId)),
          (billing) => billing.netRevenueUsd,
        );
        const cogsUsd = sum(
          costs.filter((cost) => userIds.has(cost.userId)),
          (cost) => cost.costUsd,
        );
        const profitUsd = revenueUsd - cogsUsd;
        const failedFiles = group.files.filter((file) => file.status === "failed").length;
        const questions = sum(group.files, (file) => file.questionCount);

        return {
          examGoal,
          users: userIds.size,
          revenueUsd,
          cogsUsd,
          profitUsd,
          marginPct: percent(profitUsd, revenueUsd),
          avgFilesPerUser: divide(group.files.length, userIds.size),
          avgPuPerUser: divide(sum(group.files, (file) => file.puCharged), userIds.size),
          avgQuestionsPerFile: divide(questions, group.files.length),
          failureRatePct: percent(failedFiles, group.files.length),
        };
      })
      .sort((a, b) => b.profitUsd - a.profitUsd);
  },
});

export const getModelCosts = query({
  args: rangeArgs,
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const costs = await getCostEvents(ctx, args.from, args.to);
    const grouped = new Map<string, CostEvent[]>();
    for (const cost of costs) {
      const key = `${cost.provider}:${cost.model}`;
      grouped.set(key, [...(grouped.get(key) ?? []), cost]);
    }

    return Array.from(grouped.values())
      .map((rows) => {
        const first = rows[0];
        const costUsd = sum(rows, (row) => row.costUsd);
        return {
          provider: first?.provider ?? "unknown",
          model: first?.model ?? "unknown",
          calls: rows.length,
          inputTokens: sum(rows, (row) => row.inputTokens),
          outputTokens: sum(rows, (row) => row.outputTokens),
          costUsd,
          avgCostPerCall: divide(costUsd, rows.length),
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);
  },
});

export const getQualityMetrics = query({
  args: rangeArgs,
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const users = await getUsers(ctx);
    const costs = await getCostEvents(ctx, args.from, args.to);
    const files = await getFileRows(ctx, args.from, args.to, users, costs);
    const audits = await ctx.db.query("extractionPageAudits").collect();
    const blocks = await ctx.db.query("extractionSourceBlocks").collect();
    const relevantAudits = audits.filter(
      (audit) => audit.createdAt >= args.from && audit.createdAt <= args.to,
    );

    const detectedQuestions = sum(relevantAudits, (audit) => audit.candidateQuestionCount);
    const extractedQuestions = sum(relevantAudits, (audit) => audit.extractedQuestionCount);
    const generatedQuestions = sum(relevantAudits, (audit) => audit.generatedQuestionCount);
    const incompleteQuestions = sum(relevantAudits, (audit) => audit.incompleteCount);
    const needsReviewQuestions = sum(relevantAudits, (audit) => audit.needsReviewCount);
    const failedPages = relevantAudits.filter((audit) => audit.status === "failed").length;
    const retryCount = sum(relevantAudits, (audit) => audit.retryCount);
    const confidenceRows = blocks.filter(
      (block) => block.createdAt >= args.from && block.createdAt <= args.to,
    );
    const groupedFiles = groupBy(files, (file) => file.fileType);

    return {
      detectedQuestions,
      extractedQuestions,
      generatedQuestions,
      incompleteQuestions,
      needsReviewQuestions,
      failedPages,
      retryRatePct: percent(retryCount, Math.max(1, relevantAudits.length)),
      averageConfidence: divide(
        sum(confidenceRows, (block) => block.confidence),
        confidenceRows.length,
      ),
      byFileType: Array.from(groupedFiles.entries()).map(([fileType, rows]) => {
        const questions = sum(rows, (row) => row.questionCount);
        return {
          fileType,
          retryRatePct: percent(sum(rows, (row) => row.retryCount), rows.length),
          needsReviewRatePct: percent(
            sum(rows, (row) => row.needsReviewCount),
            questions,
          ),
          failureRatePct: percent(
            rows.filter((row) => row.status === "failed").length,
            rows.length,
          ),
        };
      }),
    };
  },
});

async function getUsers(ctx: QueryCtx): Promise<AppUser[]> {
  const [users, profiles, quotas] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("userProfiles").collect(),
    ctx.db.query("userQuota").collect(),
  ]);
  const profilesByClerkId = new Map(profiles.map((profile) => [profile.clerkUserId, profile]));
  const quotasByUser = new Map(quotas.map((quota) => [quota.userId, quota]));
  const rows = users.map((user) => {
    const profile = user.clerkUserId ? profilesByClerkId.get(user.clerkUserId) : undefined;
    return normalizeUser(user, profile, quotasByUser);
  });

  for (const profile of profiles) {
    if (rows.some((row) => row.clerkUserId === profile.clerkUserId)) continue;
    rows.push(normalizeProfile(profile, quotasByUser));
  }

  return rows;
}

async function getBillingRows(
  ctx: QueryCtx,
  from: number,
  to: number,
) {
  const rows = await ctx.db.query("billingLedger").collect();
  return rows.filter((row) => row.createdAt >= from && row.createdAt <= to);
}

async function getCostEvents(
  ctx: QueryCtx,
  from: number,
  to: number,
): Promise<CostEvent[]> {
  const [ledgerRows, usageRows, users] = await Promise.all([
    ctx.db.query("costLedger").collect(),
    ctx.db.query("aiUsageEvents").collect(),
    ctx.db.query("users").collect(),
  ]);
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const normalizedLedgerRows = ledgerRows
    .filter((row) => row.createdAt >= from && row.createdAt <= to)
    .map((row) => ({
      userId: row.userId,
      fileId: row.fileId,
      jobId: row.jobId,
      provider: row.provider ?? "unknown",
      model: row.model ?? "unknown",
      inputTokens: row.inputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      costUsd: row.costUsd,
      createdAt: row.createdAt,
    }));

  const firstLedgerTimestamp = normalizedLedgerRows.length
    ? Math.min(...normalizedLedgerRows.map((row) => row.createdAt))
    : Number.POSITIVE_INFINITY;
  const fallbackUsageRows = usageRows
    .filter((row) => row.createdAt >= from && row.createdAt <= to)
    .filter((row) => row.createdAt < firstLedgerTimestamp)
    .map((row) => {
      const user = userById.get(String(row.userId));
      return {
        userId: user?.clerkUserId ?? String(row.userId),
        fileId: row.fileHash,
        jobId: row.jobId,
        provider: row.provider,
        model: row.model,
        inputTokens: row.promptTokens,
        outputTokens: row.completionTokens,
        costUsd: row.costUsd,
        createdAt: row.createdAt,
      };
    });

  return [...fallbackUsageRows, ...normalizedLedgerRows];
}

async function getFileRows(
  ctx: QueryCtx,
  from: number,
  to: number,
  users: AppUser[],
  costs: CostEvent[],
): Promise<FileRow[]> {
  const analytics = (await ctx.db.query("fileAnalytics").collect()).filter(
    (file) => file.processingStartedAt >= from && file.processingStartedAt <= to,
  );
  const userByAnyKey = makeUserLookup(users);

  if (analytics.length) {
    return analytics.map((file) => {
      const user = userByAnyKey.get(file.userId);
      return {
        fileId: file.fileId,
        userId: file.userId,
        userEmail: user?.email ?? "unknown",
        originalName: file.originalName,
        examGoal: file.examGoal,
        fileType: file.fileType,
        pageCount: file.pageCount,
        puCharged: file.puCharged,
        questionCount: file.questionCount,
        retryCount: file.retryCount,
        needsReviewCount: file.needsReviewCount,
        failedPageCount: file.failedPageCount,
        totalCostUsd: file.totalCostUsd,
        processingMs: file.processingMs,
        status: file.status,
        startedAt: file.processingStartedAt,
      };
    });
  }

  const [records, jobs, sourceFiles, audits] = await Promise.all([
    ctx.db.query("pdfExtractionRecords").collect(),
    ctx.db.query("extractionJobs").collect(),
    ctx.db.query("sourceFiles").collect(),
    ctx.db.query("extractionPageAudits").collect(),
  ]);
  const sourcesByFileHash = new Map(sourceFiles.map((source) => [source.fileHash, source]));
  const jobsByFileHash = groupBy(jobs, (job) => job.fileHash);
  const auditsByFileHash = groupBy(audits, (audit) => audit.fileHash);
  const costsByFileId = groupBy(costs, (cost) => cost.fileId ?? "");

  return records
    .filter((record) => record.createdAt >= from && record.createdAt <= to)
    .map((record) => {
      const source = sourcesByFileHash.get(record.fileHash);
      const job = latest(jobsByFileHash.get(record.fileHash) ?? [], (row) => row.updatedAt);
      const fileAudits = auditsByFileHash.get(record.fileHash) ?? [];
      const user = record.clerkUserId ? userByAnyKey.get(record.clerkUserId) : undefined;
      const fileCosts = costsByFileId.get(record.fileHash) ?? [];
      const needsReviewCount = sum(fileAudits, (audit) => audit.needsReviewCount);
      const retryCount = sum(fileAudits, (audit) => audit.retryCount);

      return {
        fileId: record.fileHash,
        userId: record.clerkUserId ?? String(record._id),
        userEmail: user?.email ?? "unknown",
        originalName: record.fileName ?? source?.fileName ?? record.title,
        examGoal: user?.examGoal,
        fileType: inferFileType(source?.mimeType, record.fileName ?? source?.fileName),
        pageCount: record.pageCount ?? job?.totalPages ?? 0,
        puCharged: record.pageCount ?? job?.totalPages ?? 0,
        questionCount: Array.isArray(record.mcqs) ? record.mcqs.length : 0,
        retryCount,
        needsReviewCount,
        failedPageCount: fileAudits.filter((audit) => audit.status === "failed").length,
        totalCostUsd: sum(fileCosts, (cost) => cost.costUsd),
        processingMs: job ? Math.max(0, job.updatedAt - job.createdAt) : 0,
        status: job?.status === "failed" ? "failed" : "done",
        startedAt: record.createdAt,
      };
    });
}

function normalizeUser(
  user: Doc<"users">,
  profile: Doc<"userProfiles"> | undefined,
  quotasByUser: Map<string, Doc<"userQuota">>,
): AppUser {
  const id = String(user._id);
  const clerkUserId = user.clerkUserId ?? user.externalId ?? undefined;
  const quota = quotasByUser.get(clerkUserId ?? id) ?? quotasByUser.get(id);
  return {
    id,
    clerkUserId,
    email: profile?.email ?? user.email ?? clerkUserId ?? id,
    name: profile?.name ?? user.name,
    plan: profile?.plan ?? user.plan ?? "free",
    examGoal: profile?.examGoal,
    subscriptionStatus:
      profile?.subscriptionStatus ??
      (user.billingStatus === "none" || !user.billingStatus ? "free" : user.billingStatus),
    createdAt: profile?.createdAt ?? user.createdAt ?? 0,
    lastActiveAt: profile?.lastActiveAt ?? user.updatedAt ?? user.createdAt ?? 0,
    monthlyPuLimit: quota?.monthlyPuLimit ?? user.monthlyCredits ?? user.monthlyPageLimit ?? 0,
    currentMonthPu: quota?.currentMonthPu ?? 0,
  };
}

function normalizeProfile(
  profile: Doc<"userProfiles">,
  quotasByUser: Map<string, Doc<"userQuota">>,
): AppUser {
  const quota = quotasByUser.get(profile.clerkUserId);
  return {
    id: profile.clerkUserId,
    clerkUserId: profile.clerkUserId,
    email: profile.email,
    name: profile.name,
    plan: profile.plan,
    examGoal: profile.examGoal,
    subscriptionStatus: profile.subscriptionStatus,
    createdAt: profile.createdAt,
    lastActiveAt: profile.lastActiveAt,
    monthlyPuLimit: quota?.monthlyPuLimit ?? 0,
    currentMonthPu: quota?.currentMonthPu ?? 0,
  };
}

function userKeys(user: AppUser): Set<string> {
  return new Set([user.id, user.clerkUserId, user.email].filter(Boolean) as string[]);
}

function makeUserLookup(users: AppUser[]): Map<string, AppUser> {
  const lookup = new Map<string, AppUser>();
  for (const user of users) {
    for (const key of userKeys(user)) lookup.set(key, user);
  }
  return lookup;
}

function getUserRedFlags(args: {
  revenueUsd: number;
  cogsUsd: number;
  profitUsd: number;
  marginPct: number;
  puUsed: number;
  monthlyPuLimit: number;
  retryRatePct: number;
  needsReviewRatePct: number;
}) {
  const flags: string[] = [];
  if (args.cogsUsd > 9) flags.push("COGS > $9");
  if (args.revenueUsd > 0 && args.marginPct < 50) flags.push("Margin < 50%");
  if (args.monthlyPuLimit > 0 && args.puUsed / args.monthlyPuLimit > 0.9) {
    flags.push("PU > 90%");
  }
  if (args.retryRatePct > 20) flags.push("Retry > 20%");
  if (args.needsReviewRatePct > 15) flags.push("Review > 15%");
  if (args.profitUsd < 0) flags.push("Negative profit");
  return flags;
}

function getFileRedFlags(file: FileRow) {
  const flags: string[] = [];
  if (file.processingMs > 2 * 60 * 1000) flags.push("Slow processing");
  if (file.retryCount > 3) flags.push("High retry");
  if (percent(file.needsReviewCount, file.questionCount) > 20) {
    flags.push("High review");
  }
  if (file.fileType === "dense_notability" && file.totalCostUsd > 1) {
    flags.push("Dense high cost");
  }
  if (file.failedPageCount > 0) flags.push("Failed pages");
  return flags;
}

function inferFileType(mimeType?: string, fileName?: string) {
  const lowerName = fileName?.toLowerCase() ?? "";
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("text/")) return "text";
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".rtf")) {
    return "text";
  }
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) return "selectable_pdf";
  return "other";
}

function latest<T>(rows: T[], getValue: (row: T) => number): T | undefined {
  return rows.reduce<T | undefined>((best, row) => {
    if (!best || getValue(row) > getValue(best)) return row;
    return best;
  }, undefined);
}

function groupBy<T>(rows: T[], getKey: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function sum<T>(rows: T[], getValue: (row: T) => number | undefined): number {
  return rows.reduce((total, row) => total + (getValue(row) ?? 0), 0);
}

function divide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}
