export type ConversionEventName =
  | "landing_viewed"
  | "homepage_upload_clicked"
  | "signup_cta_clicked"
  | "signup_started"
  | "signup_completed"
  | "dashboard_viewed"
  | "first_upload_started"
  | "first_extraction_completed"
  | "first_extraction_failed"
  | "study_action_completed"
  | "pricing_viewed"
  | "plan_cta_clicked"
  | "checkout_started"
  | "checkout_completed"
  | "billing_synced_active"
  | "quota_limit_seen"
  | "quota_upgrade_clicked"
  | "billing_inactive_seen"
  | "support_contact_clicked"
  | "subscription_canceled"
  | "refund_issued";

export type ConversionEventProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

type PostHogClient = {
  __loaded?: boolean;
  capture: (
    eventName: string,
    properties?: Record<string, string | number | boolean | null>,
  ) => void;
  identify: (
    distinctId: string,
    properties?: Record<string, string | number | boolean | null>,
  ) => void;
  init: (
    token: string,
    config?: Record<string, string | number | boolean | string[]>,
  ) => PostHogClient;
};

const publicPostHogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const publicPostHogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let posthogPromise: Promise<PostHogClient | null> | null = null;

function cleanProperties(properties: ConversionEventProperties = {}) {
  const cleaned: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) cleaned[key] = value;
  }

  return cleaned;
}

function browserContext() {
  if (typeof window === "undefined") return {};

  return cleanProperties({
    path: window.location.pathname,
    search: window.location.search || undefined,
    referrer: document.referrer || undefined,
  });
}

async function getPostHog() {
  if (typeof window === "undefined" || !publicPostHogKey) return null;

  posthogPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      const client = posthog as unknown as PostHogClient;
      if (!client.__loaded) {
        client.init(publicPostHogKey, {
          api_host: publicPostHogHost,
          capture_pageview: false,
          person_profiles: "identified_only",
        });
      }
      return client;
    })
    .catch(() => null);

  return posthogPromise;
}

export function captureConversionEvent(
  eventName: ConversionEventName,
  properties?: ConversionEventProperties,
) {
  if (typeof window === "undefined") return;

  const payload = {
    ...browserContext(),
    ...cleanProperties(properties),
  };

  window.dispatchEvent(
    new CustomEvent("testnote:conversion-event", {
      detail: { eventName, properties: payload },
    }),
  );

  if (process.env.NODE_ENV === "development") {
    console.info(`[conversion] ${eventName}`, payload);
  }

  void getPostHog().then((posthog) => {
    posthog?.capture(eventName, payload);
  });
}

export function identifyConversionUser(
  distinctId: string,
  properties?: ConversionEventProperties,
) {
  if (typeof window === "undefined") return;

  void getPostHog().then((posthog) => {
    posthog?.identify(distinctId, cleanProperties(properties));
  });
}
