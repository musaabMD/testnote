import { auth } from "@clerk/nextjs/server";
import {
  CLERK_FEATURES,
  getClerkFeatureSlug,
  type ClerkFeatureKey,
} from "@/lib/clerk-features";
import { getConfiguredClerkPlanSlugs } from "@/lib/clerk-billing.server";

export type ClerkAccess = {
  userId: string | null;
  hasFeature: (feature: string) => boolean;
  hasPlan: (planSlug: string) => boolean;
  hasAnyPaidPlan: () => boolean;
  hasPaidAccess: () => boolean;
};

export async function getClerkAccess(): Promise<ClerkAccess> {
  try {
    const session = await auth();
    const hasFeature = (feature: string) => session.has({ feature });
    const hasPlan = (planSlug: string) => session.has({ plan: planSlug });
    const paidPlanSlugs = getConfiguredClerkPlanSlugs();

    return {
      userId: session.userId ?? null,
      hasFeature,
      hasPlan,
      hasAnyPaidPlan: () => paidPlanSlugs.some((slug) => hasPlan(slug)),
      hasPaidAccess: () =>
        hasFeature(getClerkFeatureSlug("paidAccess")) ||
        paidPlanSlugs.some((slug) => hasPlan(slug)),
    };
  } catch {
    return {
      userId: null,
      hasFeature: () => false,
      hasPlan: () => false,
      hasAnyPaidPlan: () => false,
      hasPaidAccess: () => false,
    };
  }
}

export async function requireClerkFeature(
  featureKey: ClerkFeatureKey,
): Promise<{ userId: string } | Response> {
  const access = await getClerkAccess();

  if (!access.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!access.hasFeature(getClerkFeatureSlug(featureKey))) {
    return Response.json(
      { error: "Upgrade required to use this feature." },
      { status: 403 },
    );
  }

  return { userId: access.userId };
}

export async function requirePaidAccess(): Promise<{ userId: string } | Response> {
  const access = await getClerkAccess();

  if (!access.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!access.hasPaidAccess()) {
    return Response.json(
      { error: "A paid plan is required. Upgrade at /pricing." },
      { status: 403 },
    );
  }

  return { userId: access.userId };
}

export { CLERK_FEATURES };
