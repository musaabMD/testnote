import { isQuotaEnforcementEnabled, getUsageLedgerSecret } from "@/lib/convex-usage-client.server";

type ConvexPlan = "free" | "starter" | "pro" | "school";
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
  hasPlan: (planSlug: string) => boolean;
}): Promise<void> {
  if (!isQuotaEnforcementEnabled()) return;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = getUsageLedgerSecret();
  if (!convexUrl || !secret) return;

  const plan = resolveClerkBillingPlan(args.hasPlan);
  const billingStatus: BillingStatus = plan === "free" ? "none" : "active";

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(convexUrl);

    await client.mutation(api.usageLedger.setUserPlanByClerkId, {
      secret,
      clerkUserId: args.clerkUserId,
      plan,
      billingStatus,
    });
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
