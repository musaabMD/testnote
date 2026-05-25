import { registerRoutes } from "@convex-dev/stripe";
import { httpRouter, type GenericActionCtx, type GenericDataModel } from "convex/server";
import type Stripe from "stripe";
import { api, components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { resend } from "./emails";
import { streamTutorText } from "./streaming";
import {
  normalizeStripeBillingStatus,
  resolveStripePlan,
} from "./stripePlanSync";

const http = httpRouter();

registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  events: {
    "checkout.session.completed": async (ctx, event) => {
      await syncCheckoutSession(ctx, event.data.object as Stripe.Checkout.Session);
    },
    "customer.subscription.updated": async (ctx, event) => {
      await syncSubscription(ctx, event.data.object as Stripe.Subscription);
    },
    "customer.subscription.deleted": async (ctx, event) => {
      await syncSubscription(ctx, event.data.object as Stripe.Subscription, {
        forcedPlan: "free",
        forcedBillingStatus: "canceled",
      });
    },
    "invoice.payment_failed": async (ctx, event) => {
      await syncFailedInvoice(ctx, event.data.object as Stripe.Invoice);
    },
  },
});

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req);
  }),
});

http.route({
  path: "/tutor-stream",
  method: "POST",
  handler: streamTutorText,
});

export default http;

type StripeActionCtx = GenericActionCtx<GenericDataModel>;

function getUsageSecret() {
  return process.env.USAGE_LEDGER_SECRET ?? process.env.EXTRACTION_STORAGE_SECRET ?? "";
}

function stripeId(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

function getSubscriptionPrice(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    priceId: item?.price?.id,
    priceMetadata: item?.price?.metadata,
  };
}

async function getClerkUserIdForStripeCustomer(
  ctx: StripeActionCtx,
  args: {
    stripeCustomerId?: string;
    metadata?: Stripe.Metadata | null;
  },
) {
  const metadataUserId =
    args.metadata?.userId ?? args.metadata?.clerkUserId ?? args.metadata?.clerk_user_id;
  if (metadataUserId) return metadataUserId;
  if (!args.stripeCustomerId) return undefined;

  const customer = await ctx.runQuery(components.stripe.public.getCustomer, {
    stripeCustomerId: args.stripeCustomerId,
  });

  return (
    customer?.userId ??
    customer?.metadata?.userId ??
    customer?.metadata?.clerkUserId ??
    customer?.metadata?.clerk_user_id
  );
}

async function syncCheckoutSession(
  ctx: StripeActionCtx,
  session: Stripe.Checkout.Session,
) {
  const stripeCustomerId = stripeId(session.customer);
  const stripeSubscriptionId = stripeId(session.subscription);
  const clerkUserId = await getClerkUserIdForStripeCustomer(ctx, {
    stripeCustomerId,
    metadata: session.metadata,
  });
  if (!clerkUserId) {
    console.warn("[stripe-plan-sync] checkout missing Clerk user", {
      sessionId: session.id,
      stripeCustomerId,
    });
    return;
  }

  const plan = resolveStripePlan({
    priceId: session.metadata?.priceId,
    metadata: session.metadata,
  });
  if (!plan) {
    console.warn("[stripe-plan-sync] checkout missing plan mapping", {
      sessionId: session.id,
      priceId: session.metadata?.priceId,
    });
    return;
  }

  await setConvexUserPlan(ctx, {
    clerkUserId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan,
    billingStatus:
      session.payment_status === "paid" || session.payment_status === "no_payment_required"
        ? "active"
        : "none",
  });
}

async function syncSubscription(
  ctx: StripeActionCtx,
  subscription: Stripe.Subscription,
  overrides?: {
    forcedPlan?: "free";
    forcedBillingStatus?: "canceled";
  },
) {
  const stripeCustomerId = stripeId(subscription.customer);
  const clerkUserId = await getClerkUserIdForStripeCustomer(ctx, {
    stripeCustomerId,
    metadata: subscription.metadata,
  });
  if (!clerkUserId) {
    console.warn("[stripe-plan-sync] subscription missing Clerk user", {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
    });
    return;
  }

  const { priceId, priceMetadata } = getSubscriptionPrice(subscription);
  const billingStatus =
    overrides?.forcedBillingStatus ?? normalizeStripeBillingStatus(subscription.status);
  const plan =
    overrides?.forcedPlan ??
    (billingStatus === "canceled"
      ? "free"
      : resolveStripePlan({
          priceId,
          metadata: subscription.metadata,
          priceMetadata,
        }));

  if (!plan) {
    console.warn("[stripe-plan-sync] subscription missing plan mapping", {
      stripeSubscriptionId: subscription.id,
      priceId,
      status: subscription.status,
    });
    return;
  }

  await setConvexUserPlan(ctx, {
    clerkUserId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan,
    billingStatus,
  });
}

async function syncFailedInvoice(ctx: StripeActionCtx, invoice: Stripe.Invoice) {
  const stripeCustomerId = stripeId(invoice.customer);
  const stripeSubscriptionId = stripeId(
    (invoice as unknown as { subscription?: string | { id: string } | null })
      .subscription,
  );
  const clerkUserId = await getClerkUserIdForStripeCustomer(ctx, {
    stripeCustomerId,
    metadata: invoice.metadata,
  });
  if (!clerkUserId) {
    console.warn("[stripe-plan-sync] invoice missing Clerk user", {
      invoiceId: invoice.id,
      stripeCustomerId,
      stripeSubscriptionId,
    });
    return;
  }

  await setConvexUserPlan(ctx, {
    clerkUserId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan: "free",
    billingStatus: "past_due",
  });
}

async function setConvexUserPlan(
  ctx: StripeActionCtx,
  args: {
    clerkUserId: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    plan: "free" | "starter" | "pro" | "school";
    billingStatus: "active" | "trialing" | "past_due" | "canceled" | "none";
  },
) {
  const secret = getUsageSecret();
  if (!secret) {
    throw new Error("USAGE_LEDGER_SECRET or EXTRACTION_STORAGE_SECRET is required for Stripe plan sync.");
  }

  await ctx.runMutation(api.usageLedger.setUserPlanByClerkId, {
    secret,
    clerkUserId: args.clerkUserId,
    plan: args.plan,
    billingStatus: args.billingStatus,
    stripeCustomerId: args.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId,
  });
}
