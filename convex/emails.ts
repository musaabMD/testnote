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

export const getEmailStatus = query({
  args: {
    id: vEmailId,
  },
  handler: async (ctx, args) => {
    return await resend.status(ctx, args.id);
  },
});
