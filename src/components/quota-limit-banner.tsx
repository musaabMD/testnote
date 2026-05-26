"use client";

import Link from "next/link";
import { classifyUsageError } from "@/lib/quota-errors";

type QuotaLimitBannerProps = {
  message: string;
  className?: string;
  compact?: boolean;
};

export function QuotaLimitBanner({
  message,
  className = "",
  compact = false,
}: QuotaLimitBannerProps) {
  const classified = classifyUsageError(message);
  const isActionable =
    classified.kind === "plan_quota" ||
    classified.kind === "billing_inactive" ||
    classified.kind === "rate_limit";

  const toneClass =
    classified.kind === "rate_limit"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : classified.kind === "billing_inactive"
        ? "border-violet-200 bg-violet-50 text-violet-900"
        : classified.kind === "plan_quota"
          ? "border-blue-200 bg-blue-50 text-blue-900"
          : "border-red-200 bg-red-50 text-red-700";

  if (compact && !isActionable) {
    return (
      <p className={`text-sm leading-relaxed ${className}`}>{classified.message}</p>
    );
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${toneClass} ${className}`}
      role="alert"
    >
      {isActionable ? (
        <p className="text-sm font-semibold">{classified.title}</p>
      ) : null}
      <p className={`text-sm leading-relaxed ${isActionable ? "mt-1" : ""}`}>
        {classified.message}
      </p>
      {classified.primaryHref && classified.primaryLabel ? (
        <div className={`flex flex-wrap gap-2 ${compact ? "mt-2" : "mt-3"}`}>
          <Link
            className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
              classified.kind === "billing_inactive"
                ? "bg-violet-700 hover:bg-violet-800"
                : "bg-blue-700 hover:bg-blue-800"
            }`}
            href={classified.primaryHref}
          >
            {classified.primaryLabel}
          </Link>
          {classified.secondaryHref && classified.secondaryLabel ? (
            <Link
              className="inline-flex items-center rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white"
              href={classified.secondaryHref}
            >
              {classified.secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
      {classified.kind === "rate_limit" ? (
        <p className="mt-2 text-xs opacity-80">
          Rate limits protect shared AI capacity. Wait a minute before retrying.
        </p>
      ) : null}
    </div>
  );
}
