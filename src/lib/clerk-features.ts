/**
 * Clerk Billing feature slugs — create matching Features in Clerk Dashboard
 * and attach them to the appropriate Plans.
 *
 * @see https://clerk.com/docs/guides/billing/for-b2c-saas
 */
export const CLERK_FEATURES = {
  /** Attached to all paid plans (Starter, Pro, Max, Teams). */
  paidAccess: process.env.CLERK_FEATURE_PAID_ACCESS ?? "paid_access",
  /** Pro+ plans — analysis, bulk grammar, OCR. */
  advancedStudy: process.env.CLERK_FEATURE_ADVANCED_STUDY ?? "advanced_study",
} as const;

export type ClerkFeatureKey = keyof typeof CLERK_FEATURES;

export function getClerkFeatureSlug(key: ClerkFeatureKey): string {
  return CLERK_FEATURES[key];
}
