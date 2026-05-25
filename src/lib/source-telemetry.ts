export type SourceViewTelemetry = {
  fileId: string;
  questionId: string;
  pageNumber: number;
  hasSourceRegion: boolean;
  sourceKind?: string;
  method?: string;
  confidence?: number;
  usedCachedPagePreview: boolean;
  cacheSource?: "server" | "indexeddb" | "pdfjs";
  highlightConfirmed: boolean;
  renderMs: number;
  debugMode?: boolean;
};

export function logSourceViewEvent(payload: SourceViewTelemetry) {
  const line = `[source-view] ${JSON.stringify(payload)}`;
  console.info(line);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("testnote:source-view", { detail: payload }));
  }

  try {
    void import("posthog-js").then(({ default: posthog }) => {
      if (typeof posthog?.capture === "function") {
        posthog.capture("source_view", payload);
      }
    });
  } catch {
    // PostHog optional.
  }
}
