"use client";

import { AlertCircle, ArrowRight, CheckCircle2, CreditCard } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { captureConversionEvent } from "@/lib/conversion-analytics";
import { classifyUsageError } from "@/lib/quota-errors";
import { cn } from "@/lib/utils";

type QuotaLimitBannerProps = {
  message: string;
  className?: string;
  compact?: boolean;
  modalOnly?: boolean;
  surface?: string;
};

export function QuotaLimitBanner({
  message,
  className = "",
  compact = false,
  modalOnly = false,
  surface,
}: QuotaLimitBannerProps) {
  const classified = classifyUsageError(message);
  const trackedSeenRef = useRef(false);
  const eventSurface =
    surface ?? (compact ? "compact_quota_banner" : "quota_banner");
  const isActionable =
    classified.kind === "plan_quota" ||
    classified.kind === "billing_inactive" ||
    classified.kind === "rate_limit";
  const showUpgradePrompt =
    classified.kind === "plan_quota" || classified.kind === "billing_inactive";

  const toneClass =
    classified.kind === "rate_limit"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : classified.kind === "billing_inactive"
        ? "border-violet-200 bg-violet-50 text-violet-900"
        : classified.kind === "plan_quota"
          ? "border-blue-200 bg-blue-50 text-blue-900"
          : "border-red-200 bg-red-50 text-red-700";

  useEffect(() => {
    if (trackedSeenRef.current) return;
    trackedSeenRef.current = true;

    if (classified.kind === "billing_inactive") {
      captureConversionEvent("billing_inactive_seen", {
        billing_status: "inactive",
        limit_type: classified.kind,
        surface: eventSurface,
      });
      return;
    }

    if (classified.kind === "plan_quota") {
      captureConversionEvent("quota_limit_seen", {
        limit_type: classified.kind,
        surface: eventSurface,
      });
    }
  }, [classified.kind, eventSurface]);

  if (compact && !isActionable) {
    return (
      <p className={`text-sm leading-relaxed ${className}`}>{classified.message}</p>
    );
  }

  if (showUpgradePrompt) {
    const isBillingInactive = classified.kind === "billing_inactive";
    const promptAccent = isBillingInactive
      ? "from-violet-600 to-blue-600"
      : "from-blue-600 to-cyan-600";
    const dialogContent = (
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className={cn("h-1.5 bg-gradient-to-r", promptAccent)} />
        <div className="p-5">
          <DialogHeader>
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-xl text-white",
                isBillingInactive ? "bg-violet-700" : "bg-blue-700",
              )}
            >
              <CreditCard className="size-5" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-normal text-slate-950">
              {classified.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-600">
              {isBillingInactive
                ? "Update billing to keep extracting questions from your files."
                : "Choose a plan to keep extracting questions from your files."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-2 text-sm text-slate-700">
            {[
              "AI question extraction",
              "Larger upload and monthly limits",
              "Study tools for your saved files",
            ].map((item) => (
              <div className="flex items-center gap-2" key={item}>
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="bg-slate-50">
          <DialogClose
            render={
              <button
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                type="button"
              />
            }
          >
            Not now
          </DialogClose>
          {classified.primaryHref && classified.primaryLabel ? (
            <Link
              className={cn(
                "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-white transition-colors",
                isBillingInactive
                  ? "bg-violet-700 hover:bg-violet-800"
                  : "bg-blue-700 hover:bg-blue-800",
              )}
              href={classified.primaryHref}
              onClick={() => {
                captureConversionEvent("quota_upgrade_clicked", {
                  limit_type: classified.kind,
                  surface: modalOnly ? `${eventSurface}_dialog` : "quota_dialog",
                });
              }}
            >
              {classified.primaryLabel}
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </DialogFooter>
      </DialogContent>
    );

    if (modalOnly) {
      return <Dialog defaultOpen>{dialogContent}</Dialog>;
    }

    return (
      <Dialog defaultOpen={!compact}>
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 shadow-sm",
            compact ? "text-xs" : "text-sm",
            className,
          )}
          role="alert"
        >
          <div className="flex min-w-0 items-start gap-2">
            <span
              className={cn(
                "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg",
                isBillingInactive
                  ? "bg-violet-50 text-violet-700"
                  : "bg-blue-50 text-blue-700",
              )}
            >
              <CreditCard className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-950">{classified.title}</p>
              <p className="mt-0.5 leading-relaxed text-slate-600">
                {classified.message}
              </p>
            </div>
          </div>
          {classified.primaryHref && classified.primaryLabel ? (
            <DialogTrigger
              render={
                <button
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1.5 font-semibold text-white transition-colors",
                    isBillingInactive
                      ? "bg-violet-700 hover:bg-violet-800"
                      : "bg-blue-700 hover:bg-blue-800",
                    compact ? "text-xs" : "text-sm",
                  )}
                  onClick={() => {
                    captureConversionEvent("quota_upgrade_clicked", {
                      limit_type: classified.kind,
                      surface: eventSurface,
                    });
                  }}
                  type="button"
                />
              }
            >
              {compact ? "Plans" : classified.primaryLabel}
            </DialogTrigger>
          ) : null}
        </div>

        {dialogContent}
      </Dialog>
    );
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${toneClass} ${className}`}
      role="alert"
    >
      <div className="flex gap-2">
        {isActionable ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
        ) : null}
        <div>
          {isActionable ? (
            <p className="text-sm font-semibold">{classified.title}</p>
          ) : null}
          <p
            className={`text-sm leading-relaxed ${
              isActionable ? "mt-1" : ""
            }`}
          >
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
                onClick={() => {
                  captureConversionEvent("quota_upgrade_clicked", {
                    limit_type: classified.kind,
                    surface: compact ? "compact_quota_banner" : "quota_banner",
                  });
                }}
              >
                {classified.primaryLabel}
              </Link>
              {classified.secondaryHref && classified.secondaryLabel ? (
                <Link
                  className="inline-flex items-center rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white"
                  href={classified.secondaryHref}
                  onClick={() => {
                    captureConversionEvent("support_contact_clicked", {
                      path: classified.secondaryHref,
                      reason: classified.kind,
                    });
                  }}
                >
                  {classified.secondaryLabel}
                </Link>
              ) : null}
            </div>
          ) : null}
          {classified.kind === "rate_limit" ? (
            <p className="mt-2 text-xs opacity-80">
              Rate limits protect shared AI capacity. Wait a minute before
              retrying.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
