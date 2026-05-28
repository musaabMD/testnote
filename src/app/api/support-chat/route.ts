import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getOpenRouterMaxTokens,
  getOpenRouterModel,
} from "@/lib/openrouter-client";

export const dynamic = "force-dynamic";

type SupportCategory =
  | "message"
  | "bug"
  | "feedback"
  | "review"
  | "suggest_exam"
  | "suggest_feature"
  | "rating";

type SupportMessage = {
  role: "user" | "assistant" | "admin" | "system";
  body: string;
};

type SupportAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
};

let openrouterClient: ReturnType<typeof createOpenAI> | null = null;
let knowledgeCache: string | null = null;

function getSupportModelClient() {
  if (!openrouterClient) {
    openrouterClient = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
      baseURL: process.env.OPENROUTER_API_KEY
        ? "https://openrouter.ai/api/v1"
        : undefined,
      headers: process.env.OPENROUTER_API_KEY
        ? {
            "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
            "X-Title": "DrNote Support",
          }
        : undefined,
    });
  }

  return openrouterClient;
}

async function getSupportKnowledge() {
  if (!knowledgeCache) {
    knowledgeCache = await readFile(
      join(process.cwd(), "docs", "SUPPORT_ASSISTANT_KNOWLEDGE.md"),
      "utf8",
    );
  }
  return knowledgeCache;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  const body = (await req.json().catch(() => null)) as
    | {
        category?: SupportCategory;
        message?: string;
        rating?: number;
        history?: SupportMessage[];
        attachments?: SupportAttachment[];
      }
    | null;

  const message = body?.message?.trim() ?? "";
  const rating = normalizeRating(body?.rating);
  const attachments = (body?.attachments ?? []).filter((attachment) =>
    attachment.mimeType.startsWith("image/"),
  );
  if (!message && attachments.length === 0 && rating === undefined) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  if (!apiKey) {
    return Response.json({
      reply: fallbackReply(body?.category ?? "message", attachments.length),
    });
  }

  const model = process.env.OPENROUTER_API_KEY
    ? getOpenRouterModel("OPENROUTER_SUPPORT_MODEL")
    : process.env.OPENAI_SUPPORT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const knowledge = await getSupportKnowledge();
  const history = (body?.history ?? [])
    .slice(-12)
    .map((item) => `${item.role}: ${item.body}`)
    .join("\n");
  const attachmentText = attachments.length
    ? `\nAttached images: ${attachments
        .map((attachment) => `${attachment.name} (${attachment.mimeType})`)
        .join(", ")}`
    : "";

  try {
    const result = await generateText({
      model: getSupportModelClient()(model),
      maxOutputTokens: getOpenRouterMaxTokens("OPENROUTER_SUPPORT_MAX_TOKENS", 500),
      temperature: 0.2,
      system: [
        "You are DrNote Support, an AI support agent for the DrNote study app.",
        "Use the support knowledge below as your product context.",
        "You are part of an in-app support inbox. The human team can see the full thread and attachments.",
        "Be concise, practical, and ask for one missing detail when needed.",
        "Do not claim a human has already fixed something.",
        "",
        knowledge,
      ].join("\n"),
      prompt: [
        `Current support category: ${body?.category ?? "message"}`,
        history ? `Conversation so far:\n${history}` : "",
        rating ? `User rating: ${rating}/5` : "",
        `Latest user message: ${message || (rating ? "Rating submitted." : "Image attached.")}`,
        attachmentText,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    return Response.json({ reply: result.text.trim() || fallbackReply(body?.category ?? "message", attachments.length) });
  } catch (error) {
    console.warn("[support-chat] OpenRouter failed", error);
    return Response.json({
      reply: fallbackReply(body?.category ?? "message", attachments.length),
    });
  }
}

function normalizeRating(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function fallbackReply(category: SupportCategory, attachmentCount: number) {
  const attachmentLine =
    attachmentCount > 0
      ? " I also saved your image attachment for the team to review."
      : "";

  if (category === "bug") {
    return `I saved this bug report.${attachmentLine} Please add what you expected, what happened instead, and the page where it broke.`;
  }
  if (category === "suggest_exam") {
    return `I saved your exam suggestion.${attachmentLine} Please add the exam name, country or institution, and any sample material you can share.`;
  }
  if (category === "suggest_feature") {
    return `I saved your feature suggestion.${attachmentLine} Please add the workflow it improves and whether it blocks your studying today.`;
  }
  if (category === "rating" || category === "review") {
    return `Thanks, I saved this for the team.${attachmentLine}`;
  }
  return `I saved your message.${attachmentLine} Add any extra detail here and the team can follow it in the support inbox.`;
}
