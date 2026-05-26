import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import { releaseQuotaReservation } from "@/lib/convex-usage-client.server";
import { fillPlaceholderOptions, fixGrammarItems } from "@/lib/fix-grammar";
import { getOpenRouterApiKey, getOpenRouterModel } from "@/lib/openrouter-client";
import {
  estimateGrammarCostUsd,
  reserveCostUsd,
} from "@/lib/plan-limits.server";
import { getQuotaSubjectDetails } from "@/lib/request-user.server";
import { preflightTrackedAiCall } from "@/lib/tracked-openrouter.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rateLimited = await enforceApiRateLimit(request, "grammarFix");
  if (rateLimited) return rateLimited;

  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    questionText?: string;
    options?: Array<{ label: string; text: string }>;
    mode?: "grammar" | "fill-choices";
  } | null;

  const questionText = body?.questionText?.trim() ?? "";
  const options = Array.isArray(body?.options) ? body.options : [];
  const mode = body?.mode ?? "grammar";

  if (!questionText || options.length === 0) {
    return Response.json(
      { error: "questionText and options are required." },
      { status: 400 },
    );
  }

  const quotaSubject = await getQuotaSubjectDetails(request);
  const clerkUserId = quotaSubject.clerkUserId;
  const model = getOpenRouterModel("OPENROUTER_GRAMMAR_MODEL");
  const feature = "grammar" as const;

  const preflight = await preflightTrackedAiCall({
    clerkUserId,
    email: quotaSubject.email,
    feature,
    estimatedCostUsd: reserveCostUsd(estimateGrammarCostUsd()),
    model,
  });

  if (!preflight.allowed) {
    return Response.json(
      { error: preflight.reason ?? "Usage quota exceeded." },
      { status: 402 },
    );
  }

  const tracking = {
    clerkUserId,
    email: quotaSubject.email,
    feature,
    reservationId: preflight.reservationId,
  };

  try {
    if (mode === "fill-choices") {
      const filled = await fillPlaceholderOptions(
        apiKey,
        { questionText, options },
        tracking,
      );
      if (preflight.reservationId) {
        await releaseQuotaReservation(preflight.reservationId);
      }
      return Response.json(filled);
    }

    const [fixed] = await fixGrammarItems(
      apiKey,
      [{ questionText, options }],
      tracking,
    );
    if (preflight.reservationId) {
      await releaseQuotaReservation(preflight.reservationId);
    }
    return Response.json(fixed);
  } catch (error) {
    if (preflight.reservationId) {
      await releaseQuotaReservation(preflight.reservationId);
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not fix grammar right now.",
      },
      { status: 502 },
    );
  }
}
