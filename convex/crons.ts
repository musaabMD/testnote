import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { posthog } from "./posthog";

export const refreshPosthogFlags = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.POSTHOG_PERSONAL_API_KEY) return;
    await posthog.refreshFlagDefinitions(ctx);
  },
});

const crons = cronJobs();

crons.interval(
  "refresh posthog feature flags",
  { minutes: 5 },
  internal.crons.refreshPosthogFlags,
);

export default crons;
