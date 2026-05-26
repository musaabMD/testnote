import type { ConvexPlan } from "@/lib/clerk-billing.server";

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "none";

type ClerkBillingWebhookPayload = {
  type?: string;
  data?: Record<string, unknown>;
};

const PLAN_ENV_KEYS = [
  { envKey: "CLERK_BILLING_TEAMS_PLAN", defaultSlug: "teams", convexPlan: "school" as const },
  { envKey: "CLERK_BILLING_MAX_PLAN", defaultSlug: "max", convexPlan: "school" as const },
  { envKey: "CLERK_BILLING_PRO_PLAN", defaultSlug: "pro", convexPlan: "pro" as const },
  {
    envKey: "CLERK_BILLING_STARTER_PLAN",
    defaultSlug: "starter",
    convexPlan: "starter" as const,
  },
];

export function parseClerkBillingWebhook(body: ClerkBillingWebhookPayload): {
  clerkUserId: string;
  plan: ConvexPlan;
  billingStatus: BillingStatus;
} | null {
  const type = body.type ?? "";
  if (!type.startsWith("subscription") && type !== "subscriptionItem.active") {
    return null;
  }

  const data = body.data;
  if (!data) return null;

  const clerkUserId =
    pickString(data, "payer_id") ??
    pickString(data, "user_id") ??
    pickString(data, "payer", "user_id");

  if (!clerkUserId) return null;

  const statusRaw =
    pickString(data, "status") ??
    (type.includes("pastDue") || type.includes("past_due") ? "past_due" : null) ??
    (type.includes("canceled") || type.includes("deleted") ? "canceled" : null);

  const billingStatus = normalizeBillingStatus(statusRaw, type);
  const planSlug = extractPlanSlug(data);
  const plan = planSlug ? resolvePlanFromSlug(planSlug) : billingStatus === "none" ? "free" : "free";

  if (billingStatus === "canceled" || billingStatus === "past_due") {
    return { clerkUserId, plan: "free", billingStatus };
  }

  if (plan === "free" && billingStatus === "active") {
    return { clerkUserId, plan: "free", billingStatus: "none" };
  }

  return { clerkUserId, plan, billingStatus };
}

function pickString(
  value: Record<string, unknown>,
  key: string,
  nestedKey?: string,
): string | null {
  const raw = value[key];
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (nestedKey && raw && typeof raw === "object") {
    const nested = (raw as Record<string, unknown>)[nestedKey];
    if (typeof nested === "string" && nested.length > 0) return nested;
  }
  return null;
}

function extractPlanSlug(data: Record<string, unknown>): string | null {
  const items = data.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const plan = (item as Record<string, unknown>).plan;
      if (plan && typeof plan === "object") {
        const slug = (plan as Record<string, unknown>).slug;
        if (typeof slug === "string" && slug.length > 0) return slug;
      }
      const slug = (item as Record<string, unknown>).plan_slug;
      if (typeof slug === "string" && slug.length > 0) return slug;
    }
  }

  const plan = data.plan;
  if (plan && typeof plan === "object") {
    const slug = (plan as Record<string, unknown>).slug;
    if (typeof slug === "string" && slug.length > 0) return slug;
  }

  return pickString(data, "plan_slug");
}

function resolvePlanFromSlug(slug: string): ConvexPlan {
  for (const check of PLAN_ENV_KEYS) {
    const configured = process.env[check.envKey] ?? check.defaultSlug;
    if (configured === slug) return check.convexPlan;
  }
  return "free";
}

function normalizeBillingStatus(statusRaw: string | null, eventType: string): BillingStatus {
  const normalized = (statusRaw ?? eventType).toLowerCase().replace(/[.\s-]/g, "_");

  if (normalized.includes("past_due") || normalized.includes("pastdue")) return "past_due";
  if (normalized.includes("cancel") || normalized.includes("ended")) return "canceled";
  // No free trials — treat trial status as inactive.
  if (normalized.includes("trial")) return "canceled";
  if (normalized.includes("active")) return "active";
  if (normalized.includes("none") || normalized.includes("free")) return "none";
  return "none";
}
