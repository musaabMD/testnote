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
        hasContactEmail?: boolean;
        userName?: string;
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

  const siteUrl = getSiteUrl(req);
  const userName = normalizeName(body?.userName);
  const directReply = getDirectReply(message, siteUrl, userName);
  if (directReply) {
    return Response.json({ reply: directReply });
  }

  if (!apiKey) {
    return Response.json({
      reply: fallbackReply(
        body?.category ?? "message",
        message,
        rating,
        attachments.length,
        Boolean(body?.hasContactEmail),
        userName,
      ),
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
        "If userNameKnown is true and the user asks for their name, answer with the provided userName. Do not say you cannot access it.",
        "When mentioning app pages, include full clickable URLs from the product links list. For pricing, plans, upgrades, subscriptions, or payment, include the Pricing URL and mention Dashboard for signed-in account management.",
        "If the user leaves a low rating, bad review, or negative feedback, thank them, ask what went wrong, and offer to help fix the problem in this chat.",
        "Use clean Markdown when a list helps: each bullet must be on its own line starting with '- '. Never put isolated '*' characters in the middle of a sentence.",
        "If contactEmailKnown is false, ask the user to reply with an email only when a direct human follow-up is needed.",
        "Do not claim a human has already fixed something.",
        "",
        knowledge,
      ].join("\n"),
      prompt: [
        `Current support category: ${body?.category ?? "message"}`,
        `contactEmailKnown: ${Boolean(body?.hasContactEmail)}`,
        `userNameKnown: ${Boolean(userName)}`,
        userName ? `userName: ${userName}` : "",
        [
          "Product links:",
          `- Home: ${siteUrl}/`,
          `- Pricing: ${siteUrl}/pricing`,
          `- Dashboard: ${siteUrl}/dashboard`,
          `- Exams: ${siteUrl}/exams`,
          `- Support: ${siteUrl}/support`,
        ].join("\n"),
        history ? `Conversation so far:\n${history}` : "",
        rating ? `User rating: ${rating}/5` : "",
        isUnhappyFeedback(body?.category ?? "message", message, rating)
          ? "Feedback sentiment: unhappy. Ask why and offer help."
          : "",
        `Latest user message: ${message || (rating ? "Rating submitted." : "Image attached.")}`,
        attachmentText,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    return Response.json({
      reply:
        result.text.trim() ||
        fallbackReply(
          body?.category ?? "message",
          message,
          rating,
          attachments.length,
          Boolean(body?.hasContactEmail),
          userName,
        ),
    });
  } catch (error) {
    console.warn("[support-chat] OpenRouter failed", error);
    return Response.json({
      reply: fallbackReply(
        body?.category ?? "message",
        message,
        rating,
        attachments.length,
        Boolean(body?.hasContactEmail),
        userName,
      ),
    });
  }
}

function normalizeRating(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function fallbackReply(
  category: SupportCategory,
  message: string,
  rating: number | undefined,
  attachmentCount: number,
  hasContactEmail: boolean,
  userName?: string,
) {
  const directReply = getDirectReply(
    message,
    getConfiguredSiteUrl(),
    userName,
  );
  if (directReply) return directReply;

  const attachmentLine =
    attachmentCount > 0
      ? " I also saved your image attachment for the team to review."
      : "";
  const contactLine = hasContactEmail
    ? ""
    : " If you want a direct follow-up, reply with your email.";

  if (isUnhappyFeedback(category, message, rating)) {
    return `Thanks for being honest. I saved this for the team.${attachmentLine} What went wrong, and what can I help you fix right now?${contactLine}`;
  }

  if (category === "bug") {
    return `I saved this issue report.${attachmentLine} Please add what you expected, what happened instead, and the page where it happened.${contactLine}`;
  }
  if (category === "suggest_exam") {
    return `I saved your exam suggestion.${attachmentLine} Please add the exam name, country or institution, and any sample material you can share.${contactLine}`;
  }
  if (category === "suggest_feature") {
    return `I saved your feature suggestion.${attachmentLine} Please add the workflow it improves and whether it blocks your studying today.${contactLine}`;
  }
  if (category === "rating" || category === "review") {
    return `Thanks, I saved this for the team.${attachmentLine}${contactLine}`;
  }
  return `I saved your message.${attachmentLine} Add any extra detail here and the team can follow it in the support inbox.${contactLine}`;
}

function isUnhappyFeedback(
  category: SupportCategory,
  message: string,
  rating: number | undefined,
) {
  if (typeof rating === "number" && rating <= 3) return true;
  if (category !== "review" && category !== "rating" && category !== "feedback") {
    return false;
  }
  return /\b(bad|terrible|awful|poor|hate|disappointed|frustrated|annoying|confusing|broken|not good|doesn't work|does not work|waste)\b/i.test(
    message,
  );
}

function getDirectReply(message: string, siteUrl: string, userName?: string) {
  const lowerMessage = message.toLowerCase();
  if (userName && /\b(my name|who am i|what is my name)\b/.test(lowerMessage)) {
    return `Your name is ${userName}.`;
  }
  if (
    /\b(price|pricing|plan|upgrade|payment|pay|subscribe|subscription|billing)\b/.test(
      lowerMessage,
    )
  ) {
    return [
      "Use these links:",
      `- Pricing: ${siteUrl}/pricing`,
      `- Dashboard: ${siteUrl}/dashboard`,
    ].join("\n");
  }
  if (
    /\b(this website|what is this|what does this site|what is drnote)\b/.test(
      lowerMessage,
    )
  ) {
    return `This is DrNote, a study app for turning files into quizzes, explanations, and exam-style practice. Start here: ${siteUrl}/.`;
  }
  return "";
}

function normalizeName(value: string | undefined) {
  const name = value?.replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 80) : undefined;
}

function getSiteUrl(req: Request) {
  const configured = getConfiguredSiteUrl();
  if (configured !== "http://localhost:3000") return configured;
  return new URL(req.url).origin;
}

function getConfiguredSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}
