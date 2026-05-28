type TimingEntry = {
  name: string;
  start: number;
  duration?: number;
};

const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]+$/;

function now() {
  return performance.now();
}

function sanitizeTimingName(name: string) {
  const normalized = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return SAFE_TOKEN_PATTERN.test(normalized) ? normalized : "step";
}

export function createServerTiming() {
  const startedAt = now();
  const entries: TimingEntry[] = [];

  return {
    mark(name: string) {
      entries.push({
        name: sanitizeTimingName(name),
        start: now(),
      });
    },
    measure<T>(name: string, task: () => Promise<T>): Promise<T> {
      const start = now();
      return task().finally(() => {
        entries.push({
          name: sanitizeTimingName(name),
          start,
          duration: now() - start,
        });
      });
    },
    headers() {
      const totalDuration = now() - startedAt;
      const measuredEntries = entries
        .filter((entry) => entry.duration !== undefined)
        .map((entry) => `${entry.name};dur=${entry.duration!.toFixed(1)}`);

      return {
        "Server-Timing": [
          `total;dur=${totalDuration.toFixed(1)}`,
          ...measuredEntries,
        ].join(", "),
      };
    },
    summary() {
      const totalDurationMs = now() - startedAt;
      return {
        totalDurationMs: Math.round(totalDurationMs),
        steps: entries
          .filter((entry) => entry.duration !== undefined)
          .map((entry) => ({
            name: entry.name,
            durationMs: Math.round(entry.duration!),
          })),
      };
    },
  };
}

export function logPerformanceEvent(
  event: string,
  payload: Record<string, unknown>,
) {
  if (process.env.PERFORMANCE_LOGGING_ENABLED !== "true") return;

  console.info(
    JSON.stringify({
      event,
      ...payload,
      loggedAt: new Date().toISOString(),
    }),
  );
}
