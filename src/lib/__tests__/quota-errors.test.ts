import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyUsageError,
  formatUsageErrorForChat,
} from "../quota-errors.ts";

describe("classifyUsageError", () => {
  it("classifies monthly AI budget as plan quota", () => {
    const result = classifyUsageError(
      "Monthly AI budget reached ($0.05).",
    );
    assert.equal(result.kind, "plan_quota");
    assert.equal(result.primaryHref, "/pricing");
    assert.equal(result.primaryLabel, "Upgrade plan");
  });

  it("classifies billing inactive separately from quota", () => {
    const result = classifyUsageError(
      "Subscription inactive. Update billing to continue.",
    );
    assert.equal(result.kind, "billing_inactive");
    assert.equal(result.primaryLabel, "Manage billing");
  });

  it("classifies rate limits without upgrade CTA", () => {
    const result = classifyUsageError("Rate limit exceeded. Try again later.");
    assert.equal(result.kind, "rate_limit");
    assert.equal(result.primaryHref, undefined);
  });

  it("classifies file and page limits as plan quota", () => {
    assert.equal(
      classifyUsageError("File is too large for this plan.").kind,
      "plan_quota",
    );
    assert.equal(
      classifyUsageError(
        "File page count exceeds this plan limit (50 pages per file).",
      ).kind,
      "plan_quota",
    );
  });
});

describe("formatUsageErrorForChat", () => {
  it("appends pricing guidance for quota errors", () => {
    const text = formatUsageErrorForChat("Monthly upload limit reached (3 files).");
    assert.match(text, /\/pricing/);
  });

  it("appends wait guidance for rate limits", () => {
    const text = formatUsageErrorForChat("Rate limit exceeded. Try again later.");
    assert.match(text, /Wait a minute/i);
  });
});
