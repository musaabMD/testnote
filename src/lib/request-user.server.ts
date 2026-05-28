import { auth, currentUser } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { getRateLimitClientKey } from "@/lib/api-rate-limit.server";
import { isAdminUser } from "@/lib/admin-access.server";
import { syncClerkBillingPlanToConvex } from "@/lib/clerk-billing.server";

export type QuotaSubject = {
  clerkUserId: string;
  email: string | null;
  isAuthenticated: boolean;
};

export async function getRequestClerkUserId(request?: Request): Promise<string | null> {
  try {
    const session = await auth();
    return session.userId ?? (await getVerifiedBearerClerkUserId(request));
  } catch {
    return getVerifiedBearerClerkUserId(request);
  }
}

export async function getRequestClerkUser(request?: Request): Promise<{
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
    if (!session.userId) return getVerifiedBearerClerkUser(request);

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
    return getVerifiedBearerClerkUser(request);
  }
}

export async function getQuotaSubjectDetails(request: Request): Promise<QuotaSubject> {
  const user = await getRequestClerkUser(request);
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
  const userId = await getRequestClerkUserId(request);
  if (userId) return userId;
  return `anon:${getRateLimitClientKey(request)}`;
}

async function getVerifiedBearerClerkUserId(request?: Request): Promise<string | null> {
  const token = getRequestClerkToken(request);
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!token || !secretKey) return null;

  try {
    const verified = await verifyToken(token, { secretKey });
    return typeof verified.sub === "string" ? verified.sub : null;
  } catch {
    return null;
  }
}

async function getVerifiedBearerClerkUser(request?: Request): Promise<{
  clerkUserId: string;
  email: string | null;
} | null> {
  const clerkUserId = await getVerifiedBearerClerkUserId(request);
  if (!clerkUserId) return null;

  if (isAdminUser({ clerkUserId })) {
    await syncClerkBillingPlanToConvex({
      clerkUserId,
      hasPlan: () => false,
    });
  }

  return {
    clerkUserId,
    email: null,
  };
}

function getRequestClerkToken(request?: Request): string | null {
  const authorization = request?.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) return bearerMatch[1].trim();

  const cookie = request?.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === "__session") return valueParts.join("=").trim() || null;
  }
  return null;
}
