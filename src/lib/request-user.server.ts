import { auth } from "@clerk/nextjs/server";
import { getRateLimitClientKey } from "@/lib/api-rate-limit.server";
import { syncClerkBillingPlanToConvex } from "@/lib/clerk-billing.server";

export async function getRequestClerkUserId(): Promise<string | null> {
  try {
    const session = await auth();
    if (session.userId) {
      await syncClerkBillingPlanToConvex({
        clerkUserId: session.userId,
        hasPlan: (planSlug) => session.has({ plan: planSlug }),
      });
    }
    return session.userId ?? null;
  } catch {
    return null;
  }
}

export async function getQuotaSubject(request: Request): Promise<string> {
  const userId = await getRequestClerkUserId();
  if (userId) return userId;
  return `anon:${getRateLimitClientKey(request)}`;
}
