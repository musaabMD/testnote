import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { rateLimiter } from "./rateLimits";

const apiRateLimitBucket = v.union(
  v.literal("pdfExtract"),
  v.literal("tutorChat"),
  v.literal("grammarFix"),
  v.literal("ocr"),
);

export const enforceApiRateLimit = mutation({
  args: {
    bucket: apiRateLimitBucket,
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const status = await rateLimiter.limit(ctx, args.bucket, { key: args.key });
    return {
      ok: status.ok,
      retryAfterMs: status.retryAfter ?? null,
    };
  },
});
