import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.DEPLOYED_BASE_URL?.replace(/\/$/, "");
const pdfPath = process.env.DEPLOYED_TEST_PDF_PATH;
const extractionMode = process.env.DEPLOYED_TEST_EXTRACTION_MODE ?? "make-choices";
const cookie = process.env.DEPLOYED_TEST_COOKIE;
const bearerToken = process.env.DEPLOYED_TEST_BEARER_TOKEN;

if (!baseUrl || !pdfPath) {
  console.error(
    [
      "Missing required env.",
      "Usage:",
      "  DEPLOYED_BASE_URL=https://your-staging.vercel.app \\",
      "  DEPLOYED_TEST_PDF_PATH=/absolute/path/to/test.pdf \\",
      "  DEPLOYED_TEST_COOKIE='__session=...' \\",
      "  npm run test:deployed-duplicate-extraction",
      "",
      "DEPLOYED_TEST_BEARER_TOKEN may be used instead of DEPLOYED_TEST_COOKIE if your staging auth accepts it.",
    ].join("\n"),
  );
  process.exit(1);
}

const bytes = await readFile(pdfPath);
const fileHash = createHash("sha256").update(bytes).digest("hex");
const fileName = path.basename(pdfPath);
const url = `${baseUrl}/api/pdf/mcqs`;

function headers(): HeadersInit {
  const result: Record<string, string> = {};
  if (cookie) result.cookie = cookie;
  if (bearerToken) result.authorization = `Bearer ${bearerToken}`;
  return result;
}

async function upload(label: string) {
  const form = new FormData();
  form.set("extractionMode", extractionMode);
  form.set("file", new File([bytes], fileName, { type: "application/pdf" }));

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: form,
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  return {
    label,
    status: response.status,
    durationMs: Date.now() - startedAt,
    cached: body?.cached === true,
    inFlightHit: body?.inFlightHit === true,
    jobId: typeof body?.jobId === "string" ? body.jobId : null,
    failureReason: typeof body?.failureReason === "string" ? body.failureReason : null,
    questionCount: Array.isArray(body?.mcqs) ? body.mcqs.length : null,
    error: typeof body?.error === "string" ? body.error : null,
  };
}

console.log(
  JSON.stringify(
    {
      target: url,
      fileName,
      fileHash,
      extractionMode,
      auth: cookie ? "cookie" : bearerToken ? "bearer" : "none",
    },
    null,
    2,
  ),
);

const [first, second] = await Promise.all([upload("request_a"), upload("request_b")]);
const sharedJob = Boolean(first.jobId && first.jobId === second.jobId);
const anyDedupeSignal = first.inFlightHit || second.inFlightHit || first.cached || second.cached || sharedJob;

console.log(JSON.stringify({ first, second, sharedJob, anyDedupeSignal }, null, 2));

if (!first.status || first.status >= 500 || !second.status || second.status >= 500) {
  console.error("One or both deployed requests failed with a server error.");
  process.exit(1);
}

if (!anyDedupeSignal) {
  console.error(
    "No cache/in-flight/shared-job signal was returned. Check Convex extractionJobs, OpenRouter logs, and npm run report:cost for duplicate paid calls.",
  );
  process.exit(1);
}

console.log(
  "Deployed duplicate request returned a dedupe signal. Confirm one OpenRouter charge in OpenRouter logs and npm run report:cost.",
);
