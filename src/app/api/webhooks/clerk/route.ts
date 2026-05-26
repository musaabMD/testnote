import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { syncClerkBillingFromWebhook } from "@/lib/clerk-billing.server";
import { parseClerkBillingWebhook } from "@/lib/clerk-billing-webhook";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await verifyWebhook(request);
  } catch {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const parsed = parseClerkBillingWebhook(
    body as { type?: string; data?: Record<string, unknown> },
  );
  if (parsed) {
    await syncClerkBillingFromWebhook(parsed);
  }

  return Response.json({ ok: true });
}
