export type AppAuditEventType =
  | "quota_exceeded"
  | "rate_limited"
  | "source_not_ready"
  | "source_payload_missing"
  | "source_region_invalid"
  | "source_image_load_failed"
  | "duplicate_extraction_waiter"
  | "duplicate_extraction_owner"
  | "openrouter_call_blocked"
  | "budget_warning_75"
  | "budget_warning_90";

export type AppAuditFeature =
  | "extract"
  | "ask"
  | "tutor"
  | "grammar"
  | "ocr"
  | "source"
  | "rate_limit";

export type AppAuditEventInput = {
  userId?: string;
  eventType: AppAuditEventType;
  feature?: AppAuditFeature;
  fileHash?: string;
  questionId?: string;
  jobId?: string;
  reason?: string;
  metadata?: unknown;
};
