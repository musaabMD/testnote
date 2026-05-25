import { recordAppAuditEvent } from "@/lib/audit-events.server";
import { getQuotaSubject } from "@/lib/request-user.server";
import { getQuestionSourcePayload } from "@/lib/source-preview-store.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await context.params;

  try {
    const payload = await getQuestionSourcePayload(decodeURIComponent(questionId));
    if (payload.status !== "ready") {
      void recordAppAuditEvent({
        userId: await getQuotaSubject(request),
        eventType:
          payload.reason === "question_source_missing"
            ? "source_payload_missing"
            : "source_not_ready",
        feature: "source",
        questionId: payload.questionId,
        reason: payload.reason,
      });
    }
    return Response.json(payload, {
      status: payload.status === "ready" ? 200 : 200,
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
    throw error;
  }
}
