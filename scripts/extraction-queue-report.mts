import { ConvexHttpClient } from "convex/browser";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.EXTRACTION_STORAGE_SECRET;

if (!convexUrl || !secret) {
  console.error(
    [
      "Missing extraction queue report configuration.",
      "Set NEXT_PUBLIC_CONVEX_URL and EXTRACTION_STORAGE_SECRET in the environment or .env.local.",
    ].join("\n"),
  );
  process.exit(1);
}

const staleAfterMs = parsePositiveInteger(
  process.env.EXTRACTION_LOCK_STALE_AFTER_MS,
  600_000,
);

const { api } = await import("../convex/_generated/api.js");
const client = new ConvexHttpClient(convexUrl);
const report = await client.query(api.extractionStorage.getExtractionQueueHealth, {
  secret,
  staleAfterMs,
});

console.log(JSON.stringify(report, null, 2));

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
