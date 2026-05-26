import type { AiFeature } from "@/lib/usage-types";

export type { AiFeature };

export function isQuotaEnforcementEnabled(): boolean {
  const value = process.env.QUOTA_ENFORCEMENT_ENABLED?.toLowerCase();
  if (value === "0" || value === "false" || value === "no") return false;
  if (value === "1" || value === "true" || value === "yes") return true;
  return false;
}

export function assertProductionQuotaConfig(): void {
  if (process.env.NODE_ENV === "development") return;
  if (!isQuotaEnforcementEnabled()) return;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = getUsageLedgerSecret();
  if (!convexUrl || !secret) {
    throw new Error(
      "QUOTA_ENFORCEMENT_ENABLED requires NEXT_PUBLIC_CONVEX_URL and USAGE_LEDGER_SECRET in production.",
    );
  }
}

export function getUsageLedgerSecret(): string {
  return process.env.USAGE_LEDGER_SECRET ?? process.env.EXTRACTION_STORAGE_SECRET ?? "";
}

export type PreflightResult = {
  allowed: boolean;
  reason?: string;
  reservationId?: string;
  warnBudget?: boolean;
  budgetWarningThreshold?: number | null;
  plan?: string;
};

export async function preflightAiUsage(args: {
  clerkUserId: string;
  feature: AiFeature;
  estimatedCostUsd: number;
  estimatedPages?: number;
  fileSizeBytes?: number;
  jobId?: string;
  model?: string;
  reserve?: boolean;
}): Promise<PreflightResult> {
  if (!isQuotaEnforcementEnabled()) {
    return { allowed: true };
  }

  assertProductionQuotaConfig();

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = getUsageLedgerSecret();
  if (!convexUrl || !secret) {
    return {
      allowed: false,
      reason: "Usage quota is enabled but server quota storage is not configured.",
    };
  }

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(convexUrl);
    return await client.mutation(api.usageLedger.preflightAiUsage, {
      secret,
      clerkUserId: args.clerkUserId,
      feature: args.feature,
      estimatedCostUsd: args.estimatedCostUsd,
      estimatedPages: args.estimatedPages,
      fileSizeBytes: args.fileSizeBytes,
      jobId: args.jobId,
      model: args.model,
      reserve: args.reserve,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[usage] preflight failed:", error);
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Could not verify usage quota. Try again later.",
    };
  }
}

export async function commitAiUsage(args: {
  clerkUserId: string;
  reservationId?: string;
  feature: AiFeature;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  openRouterGenerationId?: string;
  jobId?: string;
  fileHash?: string;
  pagesProcessed?: number;
  status?: "estimated" | "final" | "failed" | "refunded";
  cached?: boolean;
}): Promise<void> {
  if (!isQuotaEnforcementEnabled()) return;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = getUsageLedgerSecret();
  if (!convexUrl || !secret) return;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(convexUrl);

    await client.mutation(api.usageLedger.commitAiUsage, {
      secret,
      clerkUserId: args.clerkUserId,
      reservationId: args.reservationId as never,
      feature: args.feature,
      model: args.model,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      totalTokens: args.totalTokens,
      costUsd: args.costUsd,
      openRouterGenerationId: args.openRouterGenerationId,
      jobId: args.jobId,
      fileHash: args.fileHash,
      pagesProcessed: args.pagesProcessed,
      status: args.status ?? "final",
      cached: args.cached,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[usage] commit failed:", error);
    }
  }
}

export async function commitCacheHitUsage(args: {
  clerkUserId: string;
  fileHash: string;
  feature: AiFeature;
  model: string;
}): Promise<void> {
  await commitAiUsage({
    clerkUserId: args.clerkUserId,
    feature: args.feature,
    model: args.model,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    fileHash: args.fileHash,
    status: "final",
    cached: true,
  });
}

export async function releaseQuotaReservation(reservationId: string): Promise<void> {
  if (!isQuotaEnforcementEnabled()) return;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = getUsageLedgerSecret();
  if (!convexUrl || !secret) return;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(api.usageLedger.releaseQuotaReservation, {
      secret,
      reservationId: reservationId as never,
    });
  } catch {
    // best effort
  }
}
