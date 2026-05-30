import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";
import { sanitizeUserFacingError } from "@/lib/user-facing-error.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = authorizeDebugRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const health = await client.query(api.extractionStorage.getExtractionQueueHealth, {
      secret: process.env.EXTRACTION_STORAGE_SECRET!,
      staleAfterMs: getStaleAfterMs(),
    });

    return Response.json(health, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;

    return Response.json(
      {
        error: sanitizeUserFacingError(
          error instanceof Error ? error.message : undefined,
        ),
      },
      { status: 500 },
    );
  }
}

function authorizeDebugRequest(request: Request): Response | null {
  const expectedSecrets = [
    process.env.EXTRACTION_STORAGE_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean);
  const authHeader = request.headers.get("authorization");
  const debugHeader = request.headers.get("x-debug-secret");

  if (expectedSecrets.length === 0) {
    return new Response("Debug secret is not configured.", { status: 503 });
  }

  if (
    expectedSecrets.some(
      (secret) => authHeader === `Bearer ${secret}` || debugHeader === secret,
    )
  ) {
    return null;
  }

  return new Response("Unauthorized", { status: 401 });
}

function getStaleAfterMs() {
  const parsed = Number(process.env.EXTRACTION_LOCK_STALE_AFTER_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000;
}
