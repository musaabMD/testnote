import { ConvexHttpClient } from "convex/browser";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.USAGE_LEDGER_SECRET ?? process.env.EXTRACTION_STORAGE_SECRET;

if (!convexUrl || !secret) {
  console.error(
    [
      "Missing cost report configuration.",
      "Set NEXT_PUBLIC_CONVEX_URL and USAGE_LEDGER_SECRET or EXTRACTION_STORAGE_SECRET in the environment or .env.local.",
    ].join("\n"),
  );
  process.exit(1);
}

const { api } = await import("../convex/_generated/api.js");
const client = new ConvexHttpClient(convexUrl);
const report = await client.query(api.usageLedger.getInternalCostReport, {
  secret,
});

console.log(JSON.stringify(report, null, 2));
