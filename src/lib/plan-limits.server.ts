export type AppPlan = "free" | "starter" | "pro" | "school";

export function estimateExtractionCostUsd(args: {
  pageCount: number;
  batchCount: number;
  model: string;
}): number {
  const model = args.model.toLowerCase();
  const perBatch = model.includes("flash-lite")
    ? 0.0008
    : model.includes("flash")
      ? 0.002
      : 0.006;
  const base = Math.max(1, args.batchCount) * perBatch;
  const pageFactor = Math.min(args.pageCount, 2000) / 1000;
  return base * (1 + pageFactor * 0.25);
}

export function reserveCostUsd(estimatedCostUsd: number): number {
  return estimatedCostUsd * 1.5;
}

export function estimateChatCostUsd(model: string): number {
  return model.includes("flash") ? 0.001 : 0.004;
}

export function estimateGrammarCostUsd(): number {
  return 0.002;
}

export function estimateOcrCostUsd(): number {
  return 0.01;
}

/** Conservative batch estimate for upload-time quota checks (before chunk parsing). */
export function estimateUploadExtractionBatchCount(pageCount: number): number {
  return Math.max(1, pageCount);
}

export function getMaxUploadBytesForPlan(plan: string | undefined): number {
  switch (plan) {
    case "starter":
      return 100 * 1024 * 1024;
    case "pro":
      return 250 * 1024 * 1024;
    case "school":
      return 500 * 1024 * 1024;
    default:
      return 20 * 1024 * 1024;
  }
}
