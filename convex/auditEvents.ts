import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertUsageSecret } from "./usageLedgerHelpers";

export const appAuditEventType = v.union(
  v.literal("quota_exceeded"),
  v.literal("rate_limited"),
  v.literal("source_not_ready"),
  v.literal("source_payload_missing"),
  v.literal("source_region_invalid"),
  v.literal("source_image_load_failed"),
  v.literal("duplicate_extraction_waiter"),
  v.literal("duplicate_extraction_owner"),
  v.literal("openrouter_call_blocked"),
  v.literal("budget_warning_75"),
  v.literal("budget_warning_90"),
);

const auditFeature = v.union(
  v.literal("extract"),
  v.literal("ask"),
  v.literal("tutor"),
  v.literal("grammar"),
  v.literal("ocr"),
  v.literal("source"),
  v.literal("rate_limit"),
);

export const recordAppAuditEvent = mutation({
  args: {
    secret: v.string(),
    userId: v.optional(v.string()),
    eventType: appAuditEventType,
    feature: v.optional(auditFeature),
    fileHash: v.optional(v.string()),
    questionId: v.optional(v.string()),
    jobId: v.optional(v.string()),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);
    return await ctx.db.insert("appAuditEvents", {
      userId: args.userId,
      eventType: args.eventType,
      feature: args.feature,
      fileHash: args.fileHash,
      questionId: args.questionId,
      jobId: args.jobId,
      reason: args.reason,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

export const listRecentAppAuditEvents = query({
  args: {
    secret: v.string(),
    eventType: v.optional(appAuditEventType),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertUsageSecret(args.secret);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const eventType = args.eventType;
    if (eventType) {
      return await ctx.db
        .query("appAuditEvents")
        .withIndex("by_event_type", (q) => q.eq("eventType", eventType))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("appAuditEvents").order("desc").take(limit);
  },
});
