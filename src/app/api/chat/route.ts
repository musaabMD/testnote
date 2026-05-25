import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  streamText,
  convertToModelMessages,
  type UIMessage,
  type JSONSchema7,
} from "ai";
import { enforceApiRateLimit } from "@/lib/api-rate-limit.server";
import {
  estimateChatCostUsd,
  reserveCostUsd,
} from "@/lib/plan-limits.server";
import { getQuotaSubject } from "@/lib/request-user.server";
import {
  preflightTrackedAiCall,
  commitTrackedChatUsage,
} from "@/lib/tracked-openrouter.server";
import { parseOpenRouterUsage } from "@/lib/openrouter-usage.server";
import { releaseQuotaReservation } from "@/lib/convex-usage-client.server";
import {
  getOpenRouterMaxTokens,
  getOpenRouterModel,
} from "@/lib/openrouter-client";

const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  baseURL: process.env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : undefined,
  headers: process.env.OPENROUTER_API_KEY
    ? {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "DrNote Quiz Tutor",
      }
    : undefined,
});

export async function POST(req: Request) {
  const rateLimited = await enforceApiRateLimit(req, "tutorChat");
  if (rateLimited) return rateLimited;

  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY or OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  const model =
    process.env.OPENROUTER_API_KEY
      ? getOpenRouterModel("OPENROUTER_CHAT_MODEL")
      : process.env.OPENAI_MODEL ?? "gpt-5-mini";

  const clerkUserId = await getQuotaSubject(req);
  const chatFeature = system?.includes("DrNote AI") ? "ask" : "tutor";
  const estimatedCost = reserveCostUsd(estimateChatCostUsd(model));

  const preflight = await preflightTrackedAiCall({
    clerkUserId,
    feature: chatFeature,
    estimatedCostUsd: estimatedCost,
    model,
  });

  if (!preflight.allowed) {
    return Response.json(
      { error: preflight.reason ?? "Usage quota exceeded." },
      { status: 402 },
    );
  }

  const reservationId = preflight.reservationId;

  const result = streamText({
    model: openrouter(model),
    maxOutputTokens: getOpenRouterMaxTokens("OPENROUTER_CHAT_MAX_TOKENS", 1200),
    temperature: 0.2,
    messages: await convertToModelMessages(messages),
    tools: {
      ...frontendTools(tools ?? {}),
    },
    system:
      system ??
      [
        "You are a medical study tutor.",
        "For every answer, explain each MCQ option with ✅/❌, clinical reasoning, and a '→' reason line.",
        "Never reply with only 'does not match the documented answer'. Teach the underlying principle.",
        "End with the single best answer in a blockquote when applicable.",
      ].join(" "),
    onFinish: async ({ usage, response }) => {
      const openRouterUsage = parseOpenRouterUsage({
        id: response?.id,
        usage: usage
          ? {
              prompt_tokens: usage.inputTokens,
              completion_tokens: usage.outputTokens,
              total_tokens: usage.totalTokens,
            }
          : undefined,
      });

      await commitTrackedChatUsage({
        clerkUserId,
        feature: chatFeature,
        model,
        usage: openRouterUsage,
      });

      if (reservationId) {
        await releaseQuotaReservation(reservationId);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
