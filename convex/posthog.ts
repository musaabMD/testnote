import { PostHog } from "@posthog/convex";
import { components } from "./_generated/api";

export const posthog = new PostHog(components.posthog, {
  apiKey: process.env.POSTHOG_API_KEY,
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
  host: process.env.POSTHOG_HOST,
});
