"use node";

import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action } from "./_generated/server";
import { rateLimiter } from "./rateLimits";

const stripe = new StripeSubscriptions(components.stripe, {});

function appUrl(path = "/dashboard") {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

export const createSubscriptionCheckout = action({
  args: {
    priceId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    await rateLimiter.limit(ctx, "checkout", {
      key: identity.subject,
      throws: true,
    });

    const customer = await stripe.getOrCreateCustomer(ctx, {
      userId: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    return await stripe.createCheckoutSession(ctx, {
      priceId: args.priceId,
      customerId: customer.customerId,
      mode: "subscription",
      successUrl: appUrl("/dashboard?checkout=success"),
      cancelUrl: appUrl("/dashboard?checkout=canceled"),
      metadata: { userId: identity.subject, priceId: args.priceId },
      subscriptionMetadata: { userId: identity.subject, priceId: args.priceId },
    });
  },
});

export const createCreditCheckout = action({
  args: {
    priceId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    await rateLimiter.limit(ctx, "checkout", {
      key: identity.subject,
      throws: true,
    });

    const customer = await stripe.getOrCreateCustomer(ctx, {
      userId: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    return await stripe.createCheckoutSession(ctx, {
      priceId: args.priceId,
      customerId: customer.customerId,
      mode: "payment",
      successUrl: appUrl("/dashboard?checkout=success"),
      cancelUrl: appUrl("/dashboard?checkout=canceled"),
      paymentIntentMetadata: { userId: identity.subject },
    });
  },
});

export const createCustomerPortal = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    const customer = await stripe.getOrCreateCustomer(ctx, {
      userId: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    return await stripe.createCustomerPortalSession(ctx, {
      customerId: customer.customerId,
      returnUrl: appUrl("/dashboard"),
    });
  },
});
