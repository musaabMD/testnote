"use client";

import { useUser } from "@clerk/nextjs";
import { SubscriptionDetailsButton, useSubscription } from "@clerk/nextjs/experimental";
import Link from "next/link";

export function BillingActions() {
  const { isLoaded, isSignedIn } = useUser();
  const { data: subscription, isLoading: subLoading } = useSubscription();

  if (!isLoaded || !isSignedIn) return null;

  if (subLoading) {
    return (
      <div className="h-9 w-40 animate-pulse rounded-full bg-slate-100" aria-hidden />
    );
  }

  // Top-level subscription status is always "active" or "past_due" per Clerk types
  const hasActivePlan =
    subscription?.status === "active" || subscription?.status === "past_due";

  if (!hasActivePlan) {
    return (
      <Link
        href="/pricing"
        className="inline-flex items-center rounded-full bg-zinc-950 px-5 py-2 text-sm font-bold text-white transition hover:bg-zinc-800"
      >
        Upgrade plan
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SubscriptionDetailsButton
        onSubscriptionCancel={() => {
          window.location.href = "/pricing";
        }}
      >
        <button
          type="button"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Manage subscription
        </button>
      </SubscriptionDetailsButton>
      <Link
        href="/pricing"
        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Change plan
      </Link>
    </div>
  );
}
