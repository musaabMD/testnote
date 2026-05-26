"use client";

import { useUser } from "@clerk/nextjs";
import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";

export function BillingActions() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded || !isSignedIn) return null;

  return (
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
  );
}
