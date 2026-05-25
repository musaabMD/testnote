import { recordAppAuditEvent } from "@/lib/audit-events.server";
import type { AppAuditEventInput, AppAuditEventType, AppAuditFeature } from "@/lib/audit-events";
import { getQuotaSubject } from "@/lib/request-user.server";

export const runtime = "nodejs";

const eventTypes = new Set<AppAuditEventType>([
  "quota_exceeded",
  "rate_limited",
  "source_not_ready",
  "source_payload_missing",
  "source_region_invalid",
  "source_image_load_failed",
  "duplicate_extraction_waiter",
  "duplicate_extraction_owner",
  "openrouter_call_blocked",
]);

const features = new Set<AppAuditFeature>([
  "extract",
  "ask",
  "tutor",
  "grammar",
  "ocr",
  "source",
  "rate_limit",
]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<AppAuditEventInput> | null;
  if (!body || !body.eventType || !eventTypes.has(body.eventType)) {
    return Response.json({ error: "Invalid audit event." }, { status: 400 });
  }

  if (body.feature && !features.has(body.feature)) {
    return Response.json({ error: "Invalid audit feature." }, { status: 400 });
  }

  await recordAppAuditEvent({
    userId: await getQuotaSubject(request),
    eventType: body.eventType,
    feature: body.feature,
    fileHash: body.fileHash,
    questionId: body.questionId,
    jobId: body.jobId,
    reason: body.reason,
    metadata: body.metadata,
  });

  return Response.json({ ok: true });
}
