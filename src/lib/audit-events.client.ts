import type { AppAuditEventInput } from "@/lib/audit-events";

export async function recordClientAuditEvent(args: AppAuditEventInput): Promise<void> {
  try {
    await fetch("/api/audit-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      keepalive: true,
    });
  } catch {
    // Best-effort telemetry; never block source viewing.
  }
}
