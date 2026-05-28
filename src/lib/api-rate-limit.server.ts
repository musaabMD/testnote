import { recordAppAuditEvent } from "@/lib/audit-events.server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

type RateLimitConfig = {
  rate: number;
  periodMs: number;
  capacity: number;
};

type BucketState = {
  tokens: number;
  lastRefillMs: number;
};

const buckets = new Map<string, BucketState>();

export const API_RATE_LIMITS = {
  pdfExtract: { rate: 20, periodMs: 60 * 60 * 1000, capacity: 12 },
  tutorChat: { rate: 30, periodMs: 60 * 1000, capacity: 6 },
  grammarFix: { rate: 30, periodMs: 60 * 60 * 1000, capacity: 6 },
  ocr: { rate: 12, periodMs: 60 * 60 * 1000, capacity: 4 },
} satisfies Record<string, RateLimitConfig>;

export type ApiRateLimitBucket = keyof typeof API_RATE_LIMITS;

type ConvexRateLimitResult = {
  ok: boolean;
  retryAfterMs: number | null;
};

const convexRateLimitRef = makeFunctionReference<
  "mutation",
  { bucket: ApiRateLimitBucket; key: string },
  ConvexRateLimitResult
>("apiRateLimits:enforceApiRateLimit");

let convexRateLimitClient: ConvexHttpClient | null = null;
let convexRateLimitClientUrl: string | null = null;

function refillTokens(state: BucketState, config: RateLimitConfig, now: number) {
  if (now <= state.lastRefillMs) return;

  const elapsed = now - state.lastRefillMs;
  const tokensToAdd = (elapsed / config.periodMs) * config.rate;
  state.tokens = Math.min(config.capacity, state.tokens + tokensToAdd);
  state.lastRefillMs = now;
}

export function checkApiRateLimit(
  bucketName: ApiRateLimitBucket,
  clientKey: string,
): { allowed: boolean; retryAfterSeconds?: number } {
  const config = API_RATE_LIMITS[bucketName];
  const key = `${bucketName}:${clientKey}`;
  const now = Date.now();

  let state = buckets.get(key);
  if (!state) {
    state = { tokens: config.capacity, lastRefillMs: now };
    buckets.set(key, state);
  }

  refillTokens(state, config, now);

  if (state.tokens < 1) {
    const msUntilToken = config.periodMs / config.rate;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(msUntilToken / 1000)),
    };
  }

  state.tokens -= 1;
  return { allowed: true };
}

export function getRateLimitClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "local";
}

export function rateLimitExceededResponse(retryAfterSeconds: number) {
  return Response.json(
    {
      error: "Rate limit exceeded. Try again later.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

function getConvexRateLimitUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  return url ? url : null;
}

export function isConvexRateLimiterConfigured(): boolean {
  return Boolean(getConvexRateLimitUrl());
}

function getConvexRateLimitClient(): ConvexHttpClient | null {
  const url = getConvexRateLimitUrl();
  if (!url) return null;

  if (!convexRateLimitClient || convexRateLimitClientUrl !== url) {
    convexRateLimitClient = new ConvexHttpClient(url);
    convexRateLimitClientUrl = url;
  }

  return convexRateLimitClient;
}

function retryAfterMsToSeconds(retryAfterMs: number | null | undefined): number {
  if (!retryAfterMs || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return 60;
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

async function checkDistributedApiRateLimit(
  bucketName: ApiRateLimitBucket,
  clientKey: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const client = getConvexRateLimitClient();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, retryAfterSeconds: 60 };
    }
    return checkApiRateLimit(bucketName, clientKey);
  }

  try {
    const status = await client.mutation(convexRateLimitRef, {
      bucket: bucketName,
      key: clientKey,
    });
    if (status.ok) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: retryAfterMsToSeconds(status.retryAfterMs),
    };
  } catch (error) {
    console.error("[api-rate-limit] convex limiter failed", {
      bucketName,
      hasConvexUrl: Boolean(getConvexRateLimitUrl()),
      error: error instanceof Error ? error.message : String(error),
    });

    if (process.env.NODE_ENV === "production") {
      return { allowed: false, retryAfterSeconds: 60 };
    }

    return checkApiRateLimit(bucketName, clientKey);
  }
}

export async function enforceApiRateLimit(
  request: Request,
  bucketName: ApiRateLimitBucket,
): Promise<Response | null> {
  const { getRequestClerkUserId } = await import("@/lib/request-user.server");
  const userId = await getRequestClerkUserId();
  const clientKey = userId ? `user:${userId}` : `ip:${getRateLimitClientKey(request)}`;
  const result = await checkDistributedApiRateLimit(bucketName, clientKey);
  if (!result.allowed) {
    void recordAppAuditEvent({
      userId: userId ?? clientKey,
      eventType: "rate_limited",
      feature: "rate_limit",
      reason: bucketName,
      metadata: {
        retryAfterSeconds: result.retryAfterSeconds ?? 60,
        limiter: isConvexRateLimiterConfigured() ? "convex" : "local",
      },
    });
    return rateLimitExceededResponse(result.retryAfterSeconds ?? 60);
  }
  return null;
}
