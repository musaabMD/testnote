import {
  commitAiUsage,
  preflightAiUsage,
  releaseQuotaReservation,
} from "@/lib/convex-usage-client.server";
import {
  parseOpenRouterUsage,
  type OpenRouterUsage,
  type OpenRouterUsageResponse,
} from "@/lib/openrouter-usage.server";
import { recordAppAuditEvent } from "@/lib/audit-events.server";
import { parseJsonFromModel } from "@/lib/openrouter-client";
import type { AiFeature } from "@/lib/usage-types";

export type TrackedOpenRouterContext = {
  clerkUserId: string;
  feature: AiFeature;
  reservationId?: string;
  jobId?: string;
  fileHash?: string;
  pagesProcessed?: number;
  usageAccumulator?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
};

type TrackedFetchResult = {
  response: Response;
  data: OpenRouterUsageResponse | null;
  usage: OpenRouterUsage;
};

export async function trackedOpenRouterFetch(
  ctx: TrackedOpenRouterContext,
  model: string,
  init: RequestInit,
): Promise<TrackedFetchResult> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", init);
  const data = (await response.clone().json().catch(() => null)) as OpenRouterUsageResponse | null;
  const usage = parseOpenRouterUsage(data);

  if (response.ok && usage.totalTokens > 0) {
    if (ctx.usageAccumulator) {
      ctx.usageAccumulator.promptTokens += usage.promptTokens;
      ctx.usageAccumulator.completionTokens += usage.completionTokens;
      ctx.usageAccumulator.totalTokens += usage.totalTokens;
      ctx.usageAccumulator.costUsd += usage.costUsd;
    }

    await commitAiUsage({
      clerkUserId: ctx.clerkUserId,
      feature: ctx.feature,
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      costUsd: usage.costUsd,
      openRouterGenerationId: usage.generationId,
      jobId: ctx.jobId,
      fileHash: ctx.fileHash,
      pagesProcessed: ctx.pagesProcessed,
      status: "final",
    });
  }

  return { response, data, usage };
}

export async function preflightTrackedAiCall(args: {
  clerkUserId: string;
  feature: AiFeature;
  estimatedCostUsd: number;
  estimatedPages?: number;
  fileSizeBytes?: number;
  jobId?: string;
  fileHash?: string;
  model?: string;
}): Promise<{ allowed: boolean; reason?: string; reservationId?: string }> {
  const result = await preflightAiUsage(args);
  if (!result.allowed) {
    const reason = result.reason ?? "Usage quota exceeded.";
    void recordAppAuditEvent({
      userId: args.clerkUserId,
      eventType: "quota_exceeded",
      feature: args.feature,
      fileHash: args.fileHash,
      jobId: args.jobId,
      reason,
      metadata: {
        estimatedCostUsd: args.estimatedCostUsd,
        estimatedPages: args.estimatedPages,
        fileSizeBytes: args.fileSizeBytes,
        model: args.model,
      },
    });
    void recordAppAuditEvent({
      userId: args.clerkUserId,
      eventType: "openrouter_call_blocked",
      feature: args.feature,
      fileHash: args.fileHash,
      jobId: args.jobId,
      reason,
      metadata: {
        blockType: "quota_preflight",
        estimatedCostUsd: args.estimatedCostUsd,
        estimatedPages: args.estimatedPages,
        fileSizeBytes: args.fileSizeBytes,
        model: args.model,
      },
    });
    return { allowed: false, reason: result.reason };
  }
  return { allowed: true, reservationId: result.reservationId };
}

export async function commitTrackedChatUsage(args: {
  clerkUserId: string;
  reservationId?: string;
  feature: "ask" | "tutor";
  model: string;
  usage: OpenRouterUsage;
}): Promise<void> {
  await commitAiUsage({
    clerkUserId: args.clerkUserId,
    feature: args.feature,
    model: args.model,
    promptTokens: args.usage.promptTokens,
    completionTokens: args.usage.completionTokens,
    totalTokens: args.usage.totalTokens,
    costUsd: args.usage.costUsd,
    openRouterGenerationId: args.usage.generationId,
    status: "final",
  });

  if (args.reservationId) {
    await releaseQuotaReservation(args.reservationId);
  }
}

export async function trackedCallOpenRouterJson<T>({
  ctx,
  model,
  apiKey,
  system,
  user,
  temperature = 0.1,
  maxTokens,
  title = "DrNote",
}: {
  ctx: TrackedOpenRouterContext;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  title?: string;
}): Promise<T> {
  const body = JSON.stringify({
    model,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const { response, data } = await trackedOpenRouterFetch(ctx, model, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": title,
    },
    body,
  });

  if (!response.ok) {
    const err = data as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? "OpenRouter request failed.");
  }

  const raw = data as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  } | null;
  const content = raw?.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.text ?? "").join("\n").trim()
        : "";

  if (!text) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return parseJsonFromModel(text) as T;
}
