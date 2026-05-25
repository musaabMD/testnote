const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash-lite";

type OpenRouterMessage = {
  content?: string | Array<{ type?: string; text?: string }>;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: OpenRouterMessage;
  }>;
  error?: {
    message?: string;
  };
};

export function extractOpenRouterContent(
  content: OpenRouterMessage["content"],
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();
}

export function parseJsonFromModel(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]!);
      } catch {
        // fall through
      }
    }

    const arrayMatch = candidate.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]!);
    }

    throw new Error("Model response was not valid JSON.");
  }
}

export async function callOpenRouterJson<T>({
  apiKey,
  system,
  user,
  model = process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
  temperature = 0.1,
  maxTokens,
  title = "DrNote",
}: {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  title?: string;
}): Promise<T> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": title,
    },
    body: JSON.stringify({
      model,
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as OpenRouterResponse | null;

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "OpenRouter request failed.");
  }

  const content = extractOpenRouterContent(data?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return parseJsonFromModel(content) as T;
}

export function getOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY ?? "";
}

export function getOpenRouterModel(envName: string, fallback = DEFAULT_OPENROUTER_MODEL) {
  return process.env[envName] ?? process.env.OPENROUTER_MODEL ?? fallback;
}

export function getOpenRouterMaxTokens(envName: string, fallback: number) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
