import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const root = process.cwd();
const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
}

function readEnvExample() {
  return readFileSync(path.join(root, ".env.example"), "utf8");
}

function run(command: string) {
  execSync(command, { cwd: root, stdio: "pipe" });
}

try {
  run("npm run lint");
  check("lint", true, "npm run lint passed");
} catch (error) {
  check("lint", false, error instanceof Error ? error.message : "lint failed");
}

for (const script of [
  "test:pipeline-safety",
  "test:extraction-failure",
  "test:source-qa",
  "test:upload-file-types",
  "test:clerk-billing",
  "test:quiz-progress",
  "test:quota-errors",
]) {
  try {
    run(`npm run ${script}`);
    check(script, true, `${script} passed`);
  } catch (error) {
    check(script, false, error instanceof Error ? error.message : `${script} failed`);
  }
}

const envExample = readEnvExample();
const requiredConvexR2 = [
  "R2_BUCKET",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];
for (const key of requiredConvexR2) {
  check(
    `env.example:${key}`,
    envExample.includes(`${key}=`),
    key.includes("SECRET") || key.includes("TOKEN")
      ? "placeholder present (never commit values)"
      : "documented",
  );
}

check(
  "clerk.webhook",
  envExample.includes("CLERK_WEBHOOK_SIGNING_SECRET"),
  "Add CLERK_WEBHOOK_SIGNING_SECRET to Vercel and point Clerk webhook to /api/webhooks/clerk",
);

const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
check(
  "clerk.production-keys",
  publishable.startsWith("pk_live_"),
  publishable.startsWith("pk_test_")
    ? "still using pk_test locally — production Vercel must use pk_live_"
    : publishable
      ? "publishable key looks like production"
      : "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY not loaded in this shell",
);

check(
  "quota.enforcement",
  (process.env.QUOTA_ENFORCEMENT_ENABLED ?? "true") === "true",
  `QUOTA_ENFORCEMENT_ENABLED=${process.env.QUOTA_ENFORCEMENT_ENABLED ?? "true"}`,
);

check(
  "openrouter.spend-caps",
  false,
  "Manual: set hard spend caps in OpenRouter dashboard → Settings → Limits",
);

const deployedBase = process.env.DEPLOYED_BASE_URL;
if (deployedBase && process.env.DEPLOYED_TEST_PDF_PATH) {
  try {
    run("npm run test:deployed-duplicate-extraction");
    check("deployed.duplicate-extraction", true, `verified against ${deployedBase}`);
  } catch (error) {
    check(
      "deployed.duplicate-extraction",
      false,
      error instanceof Error ? error.message : "deployed duplicate test failed",
    );
  }
} else {
  check(
    "deployed.duplicate-extraction",
    false,
    "Set DEPLOYED_BASE_URL + DEPLOYED_TEST_PDF_PATH (+ auth cookie) to run live duplicate-upload verification",
  );
}

const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));

if (failed.some((item) => item.name === "lint")) {
  process.exit(1);
}

process.exit(failed.length > 0 ? 2 : 0);
