import { isAdminUser } from "@/lib/admin-access.server";
import { isQuotaEnforcementEnabled, getUsageLedgerSecret } from "@/lib/convex-usage-client.server";
import { captureServerConversionEvent } from "@/lib/server-conversion-analytics.server";

export type ConvexPlan = "free" | "starter" | "pro" | "school";
type BillingStatus = "active" | "trialing" | "past_due" | "canceled" | "none";

type PlanCheck = {
  convexPlan: ConvexPlan;
  envKey: string;
  defaultSlug: string;
};

const PLAN_CHECKS: PlanCheck[] = [
  {
    convexPlan: "school",
    envKey: "CLERK_BILLING_TEAMS_PLAN",
    defaultSlug: "teams",
  },
  {
    convexPlan: "school",
    envKey: "CLERK_BILLING_MAX_PLAN",
    defaultSlug: "max",
  },
  {
    convexPlan: "pro",
    envKey: "CLERK_BILLING_PRO_PLAN",
    defaultSlug: "pro",
  },
  {
    convexPlan: "starter",
    envKey: "CLERK_BILLING_STARTER_PLAN",
    defaultSlug: "starter",
  },
];

export async function syncClerkBillingPlanToConvex(args: {
  clerkUserId: string;
  email?: string | null;
  hasPlan: (planSlug: string) => boolean;
}): Promise<void> {
  if (!isQuotaEnforcementEnabled()) return;

  if (isAdminUser({ clerkUserId: args.clerkUserId, email: args.email })) {
    await pushPlanToConvex({
      clerkUserId: args.clerkUserId,
      email: args.email,
      plan: "pro",
      billingStatus: "active",
      source: "request_sync",
    });
    return;
  }

  const plan = resolveClerkBillingPlan(args.hasPlan);
  const billingStatus: BillingStatus = plan === "free" ? "none" : "active";

  await pushPlanToConvex({
    clerkUserId: args.clerkUserId,
    email: args.email,
    plan,
    billingStatus,
    source: "request_sync",
  });
}

export async function syncClerkBillingFromWebhook(args: {
  clerkUserId: string;
  plan: ConvexPlan;
  billingStatus: BillingStatus;
}): Promise<void> {
  if (!isQuotaEnforcementEnabled()) return;

  if (isAdminUser({ clerkUserId: args.clerkUserId })) {
    await pushPlanToConvex({
      clerkUserId: args.clerkUserId,
      plan: "pro",
      billingStatus: "active",
      source: "clerk_webhook",
    });
    return;
  }

  await pushPlanToConvex({ ...args, source: "clerk_webhook" });
}

async function pushPlanToConvex(args: {
  clerkUserId: string;
  email?: string | null;
  plan: ConvexPlan;
  billingStatus: BillingStatus;
  source: "request_sync" | "clerk_webhook";
}) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = getUsageLedgerSecret();
  if (!convexUrl || !secret) return;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(convexUrl);

    await client.mutation(api.usageLedger.setUserPlanByClerkId, {
      secret,
      clerkUserId: args.clerkUserId,
      email: args.email ?? undefined,
      plan: args.plan,
      billingStatus: args.billingStatus,
    });

    if (args.source === "clerk_webhook") {
      if (
        args.plan !== "free" &&
        (args.billingStatus === "active" || args.billingStatus === "trialing")
      ) {
        await captureServerConversionEvent({
          eventName: "billing_synced_active",
          distinctId: args.clerkUserId,
          properties: {
            plan: args.plan,
            billing_status: args.billingStatus,
            source: args.source,
          },
        });
      }

      if (args.billingStatus === "canceled") {
        await captureServerConversionEvent({
          eventName: "subscription_canceled",
          distinctId: args.clerkUserId,
          properties: {
            plan: args.plan,
            source: args.source,
          },
        });
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[clerk-billing] Convex plan sync failed:", error);
    }
  }
}

function resolveClerkBillingPlan(hasPlan: (planSlug: string) => boolean): ConvexPlan {
  for (const check of PLAN_CHECKS) {
    const slug = process.env[check.envKey] ?? check.defaultSlug;
    if (hasPlan(slug)) return check.convexPlan;
  }
  return "free";
}

export function getConfiguredClerkPlanSlugs(): string[] {
  return PLAN_CHECKS.map((check) => process.env[check.envKey] ?? check.defaultSlug);
}
