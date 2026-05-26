import { Resend as ResendComponent, vEmailEvent, vEmailId } from "@convex-dev/resend";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

export const resend: ResendComponent = new ResendComponent(components.resend, {
  onEmailEvent: internal.emails.handleEmailEvent,
  testMode: process.env.RESEND_TEST_MODE !== "false",
});

export const handleEmailEvent = internalMutation({
  args: {
    id: vEmailId,
    event: vEmailEvent,
  },
  handler: async () => {
    return null;
  },
});

export const sendWelcomeEmail = mutation({
  args: {
    to: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    return await resend.sendEmail(ctx, {
      from: process.env.RESEND_FROM_EMAIL ?? "DrNote <onboarding@resend.dev>",
      to: args.to,
      subject: "Welcome to DrNote",
      html: "<p>Your study workspace is ready.</p>",
    });
  },
});

export const sendExtractionJobEmail = mutation({
  args: {
    secret: v.string(),
    clerkUserId: v.string(),
    fileName: v.string(),
    status: v.union(v.literal("ready"), v.literal("needs_review"), v.literal("failed")),
    questionCount: v.optional(v.number()),
    needsReviewCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expected = process.env.EXTRACTION_STORAGE_SECRET;
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized email request.");
    }

    if (args.clerkUserId.startsWith("anon:")) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (!user?.email) return null;

    const questionCount = args.questionCount ?? 0;
    const needsReviewCount = args.needsReviewCount ?? 0;
    const subject =
      args.status === "failed"
        ? `We couldn't process ${args.fileName}`
        : args.status === "needs_review"
          ? `${questionCount} questions ready, ${needsReviewCount} need review`
          : `Your ${questionCount} questions are ready`;

    const body =
      args.status === "failed"
        ? `<p>We couldn't process <strong>${escapeHtml(args.fileName)}</strong>.</p><p>${escapeHtml(args.error ?? "Please try the upload again.")}</p>`
        : `<p><strong>${questionCount}</strong> questions are ready from <strong>${escapeHtml(args.fileName)}</strong>.</p>${
            needsReviewCount > 0
              ? `<p><strong>${needsReviewCount}</strong> question${needsReviewCount === 1 ? "" : "s"} need review before studying.</p>`
              : ""
          }<p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://drnote.co"}/dashboard/content/study">Open your study workspace</a></p>`;

    return await resend.sendEmail(ctx, {
      from: process.env.RESEND_FROM_EMAIL ?? "DrNote <onboarding@resend.dev>",
      to: user.email,
      subject,
      html: body,
    });
  },
});

export const getEmailStatus = query({
  args: {
    id: vEmailId,
  },
  handler: async (ctx, args) => {
    return await resend.status(ctx, args.id);
  },
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
