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

export const runExtractionWorker = internalAction({
  args: {},
  handler: async () => {
    if (!areExtractionCronsEnabled()) return;

    const workerUrl = process.env.EXTRACTION_WORKER_URL;
    const secret = process.env.CRON_SECRET ?? process.env.EXTRACTION_STORAGE_SECRET;
    if (!workerUrl || !secret) return;

    const response = await fetch(workerUrl, {
      headers: {
        authorization: `Bearer ${secret}`,
      },
    });

    if (!response.ok) {
      console.warn("[extraction-worker-cron] worker request failed", {
        status: response.status,
      });
    }
  },
});

function areExtractionCronsEnabled() {
  return process.env.EXTRACTION_CRONS_ENABLED === "true";
}

const crons = cronJobs();

crons.interval(
  "refresh posthog feature flags",
  { minutes: 5 },
  internal.crons.refreshPosthogFlags,
);

crons.interval(
  "recover stale extraction jobs",
  { minutes: 5 },
  internal.extractionStorage.recoverStaleExtractionJobsInternal,
);

crons.interval(
  "run extraction worker",
  { minutes: 5 },
  internal.crons.runExtractionWorker,
);

export default crons;
