"use client";

import { useReportWebVitals } from "next/web-vitals";

const enabled = process.env.NEXT_PUBLIC_ENABLE_WEB_VITALS_REPORTING === "true";

type WebVitalPayload = {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating: "good" | "needs-improvement" | "poor";
  navigationType: string;
  pathname: string;
};

function sendWebVital(payload: WebVitalPayload) {
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/performance/web-vitals", body);
    return;
  }

  void fetch("/api/performance/web-vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!enabled) return;

    sendWebVital({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      pathname: window.location.pathname,
    });
  });

  return null;
}
