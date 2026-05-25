import type { AppAuditEventInput } from "@/lib/audit-events";
import { getUsageLedgerSecret } from "@/lib/convex-usage-client.server";

export async function recordAppAuditEvent(args: AppAuditEventInput): Promise<void> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = getUsageLedgerSecret();
  if (!convexUrl || !secret) return;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(convexUrl);
    await client.mutation(api.auditEvents.recordAppAuditEvent, {
      secret,
      userId: args.userId,
      eventType: args.eventType,
      feature: args.feature,
      fileHash: args.fileHash,
      questionId: args.questionId,
      jobId: args.jobId,
      reason: args.reason,
      metadata: args.metadata,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[audit-events] write failed", error);
    }
  }
}
