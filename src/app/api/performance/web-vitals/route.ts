import { logPerformanceEvent } from "@/lib/server-timing.server";

export const runtime = "nodejs";

const metricNames = new Set([
  "CLS",
  "FCP",
  "FID",
  "INP",
  "LCP",
  "TTFB",
  "Next.js-hydration",
  "Next.js-route-change-to-render",
  "Next.js-render",
]);

const ratings = new Set(["good", "needs-improvement", "poor"]);

type WebVitalBody = {
  id?: unknown;
  name?: unknown;
  value?: unknown;
  delta?: unknown;
  rating?: unknown;
  navigationType?: unknown;
  pathname?: unknown;
};

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_ENABLE_WEB_VITALS_REPORTING !== "true") {
    return Response.json({ ok: true, ignored: true });
  }

  const body = (await request.json().catch(() => null)) as WebVitalBody | null;
  if (!body || !isValidBody(body)) {
    return Response.json({ error: "Invalid metric." }, { status: 400 });
  }

  logPerformanceEvent("web_vital", {
    metricId: body.id,
    metricName: body.name,
    value: body.value,
    delta: body.delta,
    rating: body.rating,
    navigationType: body.navigationType,
    pathname: body.pathname,
  });

  return Response.json({ ok: true });
}

function isValidBody(body: WebVitalBody) {
  return (
    typeof body.id === "string" &&
    typeof body.name === "string" &&
    metricNames.has(body.name) &&
    typeof body.value === "number" &&
    Number.isFinite(body.value) &&
    typeof body.delta === "number" &&
    Number.isFinite(body.delta) &&
    typeof body.rating === "string" &&
    ratings.has(body.rating) &&
    typeof body.navigationType === "string" &&
    typeof body.pathname === "string" &&
    body.pathname.startsWith("/") &&
    body.pathname.length <= 256
  );
}
