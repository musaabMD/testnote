import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  pdfExtract: { kind: "token bucket", rate: 10, period: HOUR, capacity: 3 },
  tutorChat: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 6 },
  ocr: { kind: "token bucket", rate: 12, period: HOUR, capacity: 4 },
  grammarFix: { kind: "token bucket", rate: 30, period: HOUR, capacity: 6 },
  ragSearch: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 10 },
  checkout: { kind: "fixed window", rate: 10, period: HOUR },
});
