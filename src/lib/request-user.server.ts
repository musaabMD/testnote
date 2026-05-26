import { auth, currentUser } from "@clerk/nextjs/server";
import { getRateLimitClientKey } from "@/lib/api-rate-limit.server";
import { syncClerkBillingPlanToConvex } from "@/lib/clerk-billing.server";

export type QuotaSubject = {
  clerkUserId: string;
  email: string | null;
  isAuthenticated: boolean;
};

export async function getRequestClerkUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return session.userId ?? null;
  } catch {
    return null;
  }
}

export async function getRequestClerkUser(): Promise<{
  clerkUserId: string;
  email: string | null;
} | null> {
  try {
    const session = await auth();
    if (session.userId) {
      await syncClerkBillingPlanToConvex({
        clerkUserId: session.userId,
        hasPlan: (planSlug) => session.has({ plan: planSlug }),
      });
    }
    if (!session.userId) return null;

    const user = await currentUser().catch(() => null);
    const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
    await syncClerkBillingPlanToConvex({
      clerkUserId: session.userId,
      email,
      hasPlan: (planSlug) => session.has({ plan: planSlug }),
    });

    return {
      clerkUserId: session.userId,
      email,
    };
  } catch {
    return null;
  }
}

export async function getQuotaSubjectDetails(request: Request): Promise<QuotaSubject> {
  const user = await getRequestClerkUser();
  if (user) {
    return {
      clerkUserId: user.clerkUserId,
      email: user.email,
      isAuthenticated: true,
    };
  }
  return {
    clerkUserId: `anon:${getRateLimitClientKey(request)}`,
    email: null,
    isAuthenticated: false,
  };
}

export async function getQuotaSubject(request: Request): Promise<string> {
  const userId = await getRequestClerkUserId();
  if (userId) return userId;
  return `anon:${getRateLimitClientKey(request)}`;
}
