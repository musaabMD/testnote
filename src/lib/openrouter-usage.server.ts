export type AiFeature = "extract" | "ask" | "tutor" | "grammar" | "ocr";

export type OpenRouterUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  generationId?: string;
};

export type OpenRouterUsageResponse = {
  id?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
};

export function parseOpenRouterUsage(data: OpenRouterUsageResponse | null): OpenRouterUsage {
  const usage = data?.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
  const costUsd =
    typeof usage?.cost === "number"
      ? usage.cost
      : estimateCostFromTokens(promptTokens, completionTokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    generationId: data?.id,
  };
}

function estimateCostFromTokens(promptTokens: number, completionTokens: number): number {
  const inputRate = 0.000000075;
  const outputRate = 0.0000003;
  return promptTokens * inputRate + completionTokens * outputRate;
}
