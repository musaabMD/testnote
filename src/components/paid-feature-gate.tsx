import { Show } from "@clerk/nextjs";
import type { ReactNode } from "react";
import {
  getClerkFeatureSlug,
  type ClerkFeatureKey,
} from "@/lib/clerk-features";
import { UpgradePrompt } from "@/components/upgrade-prompt";

type PaidFeatureGateProps = {
  feature: ClerkFeatureKey;
  children: ReactNode;
  title?: string;
  message?: string;
  fallback?: ReactNode;
};

/**
 * Server Component — gates UI with Clerk Billing Features via `<Show>`.
 * Configure matching Features in Clerk Dashboard and attach them to Plans.
 */
export async function PaidFeatureGate({
  feature,
  children,
  title,
  message,
  fallback,
}: PaidFeatureGateProps) {
  const slug = getClerkFeatureSlug(feature);

  return (
    <Show
      when={{ feature: slug }}
      fallback={
        fallback ?? <UpgradePrompt title={title} message={message} />
      }
    >
      {children}
    </Show>
  );
}
