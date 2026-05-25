import type { AppPlan, BillingStatus } from "./planLimits";

const APP_PLANS = new Set<AppPlan>(["free", "starter", "pro", "school"]);

type StripeMetadata = Record<string, string> | null | undefined;

export function normalizeStripeAppPlan(value: unknown): AppPlan | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return APP_PLANS.has(normalized as AppPlan) ? (normalized as AppPlan) : null;
}

function parsePricePlanMap(): Record<string, AppPlan> {
  const map: Record<string, AppPlan> = {};
  const rawJson = process.env.STRIPE_PRICE_PLAN_MAP;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      for (const [priceId, plan] of Object.entries(parsed)) {
        const normalized = normalizeStripeAppPlan(plan);
        if (priceId && normalized) map[priceId] = normalized;
      }
    } catch (error) {
      console.warn("[stripe-plan-sync] invalid STRIPE_PRICE_PLAN_MAP", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  addEnvPriceIds(map, "STRIPE_FREE_PRICE_IDS", "free");
  addEnvPriceIds(map, "STRIPE_STARTER_PRICE_IDS", "starter");
  addEnvPriceIds(map, "STRIPE_PRO_PRICE_IDS", "pro");
  addEnvPriceIds(map, "STRIPE_SCHOOL_PRICE_IDS", "school");

  return map;
}

function addEnvPriceIds(
  map: Record<string, AppPlan>,
  envKey: string,
  plan: AppPlan,
) {
  const raw = process.env[envKey];
  if (!raw) return;
  for (const priceId of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
    map[priceId] = plan;
  }
}

export function resolveStripePlan(args: {
  priceId?: string | null;
  metadata?: StripeMetadata;
  priceMetadata?: StripeMetadata;
}): AppPlan | null {
  const metadataPlan =
    normalizeStripeAppPlan(args.metadata?.appPlan) ??
    normalizeStripeAppPlan(args.metadata?.plan) ??
    normalizeStripeAppPlan(args.metadata?.tier) ??
    normalizeStripeAppPlan(args.priceMetadata?.appPlan) ??
    normalizeStripeAppPlan(args.priceMetadata?.plan) ??
    normalizeStripeAppPlan(args.priceMetadata?.tier);

  if (metadataPlan) return metadataPlan;
  if (!args.priceId) return null;
  return parsePricePlanMap()[args.priceId] ?? null;
}

export function normalizeStripeBillingStatus(status: string | null | undefined): BillingStatus {
  if (status === "active" || status === "trialing" || status === "past_due") {
    return status;
  }
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "canceled";
  }
  return "none";
}
