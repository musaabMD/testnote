import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertUsageSecret } from "./usageLedgerHelpers";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function userScore(user: Doc<"users">, canonicalClerkUserId: string) {
  return (
    (user.clerkUserId === canonicalClerkUserId ? 100 : 0) +
    (user.email ? 20 : 0) +
    (user.billingStatus === "active" ? 20 : 0) +
    (user.plan && user.plan !== "free" ? 10 : 0) +
    (user.createdAt ? 1 : 0)
  );
}

export const consolidateDuplicateUser = mutation({
  args: {
    secret: v.string(),
    email: v.string(),
    canonicalClerkUserId: v.string(),
    duplicateClerkUserIds: v.optional(v.array(v.string())),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);

    const email = normalizeEmail(args.email);
    const ids = new Set([args.canonicalClerkUserId, ...(args.duplicateClerkUserIds ?? [])]);
    const usersById = new Map<Id<"users">, Doc<"users">>();

    for (const row of await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect()) {
      usersById.set(row._id, row);
    }

    for (const clerkUserId of ids) {
      const byClerk = await ctx.db
        .query("users")
        .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
        .first();
      if (byClerk) usersById.set(byClerk._id, byClerk);

      const byExternal = await ctx.db
        .query("users")
        .withIndex("by_external_id", (q) => q.eq("externalId", clerkUserId))
        .first();
      if (byExternal) usersById.set(byExternal._id, byExternal);
    }

    const users = [...usersById.values()].sort(
      (a, b) => userScore(b, args.canonicalClerkUserId) - userScore(a, args.canonicalClerkUserId),
    );
    if (!users.length) {
      return { ok: false, reason: "No matching users found.", matchedUsers: 0 };
    }

    const canonical = users[0]!;
    const duplicates = users.slice(1);
    const now = Date.now();
    const duplicateUserIds = duplicates.map((user) => user._id);
    const duplicateStringIds = new Set<string>();
    for (const user of duplicates) {
      if (user.clerkUserId) duplicateStringIds.add(user.clerkUserId);
      if (user.externalId) duplicateStringIds.add(user.externalId);
      duplicateStringIds.add(String(user._id));
    }
    for (const clerkUserId of ids) {
      if (clerkUserId !== args.canonicalClerkUserId) duplicateStringIds.add(clerkUserId);
    }

    if (args.dryRun) {
      return {
        ok: true,
        dryRun: true,
        canonicalUserId: canonical._id,
        canonicalClerkUserId: args.canonicalClerkUserId,
        matchedUsers: users.length,
        duplicateUsers: duplicates.length,
        duplicateStringIds: [...duplicateStringIds],
      };
    }

    await ctx.db.patch(canonical._id, {
      clerkUserId: args.canonicalClerkUserId,
      externalId: args.canonicalClerkUserId,
      email,
      updatedAt: now,
    });

    await mergeUsagePeriods(ctx, canonical._id, duplicateUserIds);
    await patchIdUserRefs(ctx, canonical._id, duplicateUserIds);
    await patchStringUserRefs(ctx, args.canonicalClerkUserId, duplicateStringIds);

    for (const duplicate of duplicates) {
      await ctx.db.delete(duplicate._id);
    }

    return {
      ok: true,
      dryRun: false,
      canonicalUserId: canonical._id,
      canonicalClerkUserId: args.canonicalClerkUserId,
      mergedUsers: duplicates.length,
      rewrittenStringIds: duplicateStringIds.size,
    };
  },
});

async function mergeUsagePeriods(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserIds: Array<Id<"users">>,
) {
  for (const duplicateUserId of duplicateUserIds) {
    const periods = await ctx.db
      .query("usagePeriods")
      .withIndex("by_user_period", (q) => q.eq("userId", duplicateUserId))
      .collect();

    for (const period of periods) {
      const canonicalPeriod = await ctx.db
        .query("usagePeriods")
        .withIndex("by_user_period", (q) =>
          q.eq("userId", canonicalUserId).eq("periodStart", period.periodStart),
        )
        .first();

      if (canonicalPeriod) {
        await ctx.db.patch(canonicalPeriod._id, {
          aiCostUsd: canonicalPeriod.aiCostUsd + period.aiCostUsd,
          promptTokens: canonicalPeriod.promptTokens + period.promptTokens,
          completionTokens: canonicalPeriod.completionTokens + period.completionTokens,
          totalTokens: (canonicalPeriod.totalTokens ?? 0) + (period.totalTokens ?? 0),
          pagesProcessed: canonicalPeriod.pagesProcessed + period.pagesProcessed,
          filesUploaded: canonicalPeriod.filesUploaded + period.filesUploaded,
          extractionJobs: canonicalPeriod.extractionJobs + period.extractionJobs,
          chatMessages: canonicalPeriod.chatMessages + period.chatMessages,
          updatedAt: Date.now(),
        });
        await ctx.db.delete(period._id);
      } else {
        await ctx.db.patch(period._id, { userId: canonicalUserId });
      }
    }
  }
}

async function patchIdUserRefs(
  ctx: MutationCtx,
  canonicalUserId: Id<"users">,
  duplicateUserIds: Array<Id<"users">>,
) {
  for (const duplicateUserId of duplicateUserIds) {
    for (const row of await ctx.db
      .query("creditLedger")
      .withIndex("by_user", (q) => q.eq("userId", duplicateUserId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalUserId });
    }
    for (const row of await ctx.db
      .query("pdfExtractions")
      .withIndex("by_user", (q) => q.eq("userId", duplicateUserId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalUserId });
    }
    for (const row of await ctx.db
      .query("aiRequests")
      .withIndex("by_user", (q) => q.eq("userId", duplicateUserId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalUserId });
    }
    for (const row of await ctx.db
      .query("aiUsageEvents")
      .withIndex("by_user", (q) => q.eq("userId", duplicateUserId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalUserId });
    }
    for (const row of await ctx.db
      .query("quotaReservations")
      .withIndex("by_user_status", (q) => q.eq("userId", duplicateUserId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalUserId });
    }
  }
}

async function patchStringUserRefs(
  ctx: MutationCtx,
  canonicalClerkUserId: string,
  duplicateIds: Set<string>,
) {
  for (const duplicateId of duplicateIds) {
    for (const row of await ctx.db
      .query("billingLedger")
      .withIndex("by_user", (q) => q.eq("userId", duplicateId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalClerkUserId });
    }
    for (const row of await ctx.db
      .query("costLedger")
      .withIndex("by_user", (q) => q.eq("userId", duplicateId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalClerkUserId });
    }
    for (const row of await ctx.db
      .query("fileAnalytics")
      .withIndex("by_user", (q) => q.eq("userId", duplicateId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalClerkUserId });
    }
    for (const row of await ctx.db
      .query("jobSummaries")
      .withIndex("by_user", (q) => q.eq("userId", duplicateId))
      .collect()) {
      await ctx.db.patch(row._id, { userId: canonicalClerkUserId });
    }
    for (const row of await ctx.db
      .query("userQuota")
      .withIndex("by_user", (q) => q.eq("userId", duplicateId))
      .collect()) {
      const existing = await ctx.db
        .query("userQuota")
        .withIndex("by_user", (q) => q.eq("userId", canonicalClerkUserId))
        .first();
      if (existing && existing._id !== row._id) {
        await ctx.db.patch(existing._id, {
          currentMonthPu: existing.currentMonthPu + row.currentMonthPu,
          todayPu: existing.todayPu + row.todayPu,
          extraPuBalance: existing.extraPuBalance + row.extraPuBalance,
          updatedAt: Date.now(),
        });
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId: canonicalClerkUserId });
      }
    }

    await patchClerkStringRows(ctx, canonicalClerkUserId, duplicateId);
  }
}

async function patchClerkStringRows(
  ctx: MutationCtx,
  canonicalClerkUserId: string,
  duplicateId: string,
) {
  for (const row of await ctx.db
    .query("sourceFiles")
    .withIndex("by_clerk_user_file_hash", (q) => q.eq("clerkUserId", duplicateId))
    .collect()) {
    const existing = await ctx.db
      .query("sourceFiles")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", canonicalClerkUserId).eq("fileHash", row.fileHash),
      )
      .first();
    if (existing && existing._id !== row._id) {
      await ctx.db.delete(row._id);
    } else {
      await ctx.db.patch(row._id, { clerkUserId: canonicalClerkUserId });
    }
  }

  for (const row of await ctx.db
    .query("pdfExtractionRecords")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", duplicateId))
    .collect()) {
    const existing = await ctx.db
      .query("pdfExtractionRecords")
      .withIndex("by_clerk_user_file_hash", (q) =>
        q.eq("clerkUserId", canonicalClerkUserId).eq("fileHash", row.fileHash),
      )
      .first();
    if (existing && existing._id !== row._id) {
      await ctx.db.delete(row._id);
    } else {
      await ctx.db.patch(row._id, { clerkUserId: canonicalClerkUserId });
    }
  }

  for (const row of await ctx.db.query("extractionJobs").collect()) {
    if (row.clerkUserId === duplicateId || row.ownerId === duplicateId) {
      await ctx.db.patch(row._id, {
        clerkUserId:
          row.clerkUserId === duplicateId ? canonicalClerkUserId : row.clerkUserId,
        ownerId: row.ownerId === duplicateId ? canonicalClerkUserId : row.ownerId,
      });
    }
  }

  for (const row of await ctx.db.query("extractionPages").collect()) {
    if (row.clerkUserId === duplicateId) {
      await ctx.db.patch(row._id, { clerkUserId: canonicalClerkUserId });
    }
  }

  for (const row of await ctx.db
    .query("appAuditEvents")
    .withIndex("by_user_created", (q) => q.eq("userId", duplicateId))
    .collect()) {
    await ctx.db.patch(row._id, { userId: canonicalClerkUserId });
  }

  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", duplicateId))
    .first();
  if (profile) {
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", canonicalClerkUserId))
      .first();
    if (existing && existing._id !== profile._id) {
      await ctx.db.delete(profile._id);
    } else {
      await ctx.db.patch(profile._id, { clerkUserId: canonicalClerkUserId });
    }
  }
}
