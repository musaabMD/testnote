export type UsageLimitKind =
  | "plan_quota"
  | "billing_inactive"
  | "rate_limit"
  | "unknown";

export type ClassifiedUsageError = {
  kind: UsageLimitKind;
  title: string;
  message: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

const PLAN_QUOTA_PATTERN =
  /monthly ai budget|monthly page limit|monthly upload limit|monthly chat limit|monthly file limit|daily chat limit|too many active extraction|file is too large|page count exceeds|usage quota exceeded|plan limit|paid plan is required/i;

const BILLING_INACTIVE_PATTERN =
  /subscription inactive|update billing|past due|payment failed/i;

const RATE_LIMIT_PATTERN = /rate limit exceeded|too many requests|try again later/i;

export function classifyUsageError(message: string): ClassifiedUsageError {
  const trimmed = message.trim();
  const normalized = trimmed || "Something went wrong.";

  if (RATE_LIMIT_PATTERN.test(normalized)) {
    return {
      kind: "rate_limit",
      title: "Too many requests",
      message: normalized,
    };
  }

  if (BILLING_INACTIVE_PATTERN.test(normalized)) {
    return {
      kind: "billing_inactive",
      title: "Billing inactive",
      message: normalized,
      primaryHref: "/pricing",
      primaryLabel: "Manage billing",
    };
  }

  if (PLAN_QUOTA_PATTERN.test(normalized)) {
    return {
      kind: "plan_quota",
      title: "Plan limit reached",
      message: normalized,
      primaryHref: "/pricing",
      primaryLabel: "Upgrade plan",
    };
  }

  return {
    kind: "unknown",
    title: "Something went wrong",
    message: normalized,
  };
}

export function formatUsageErrorForChat(message: string): string {
  const classified = classifyUsageError(message);
  if (classified.kind === "plan_quota") {
    return `${classified.message} Upgrade your plan at /pricing to continue.`;
  }
  if (classified.kind === "billing_inactive") {
    return `${classified.message} Update billing at /pricing to continue.`;
  }
  if (classified.kind === "rate_limit") {
    return `${classified.message} Wait a minute and try again.`;
  }
  return classified.message;
}
