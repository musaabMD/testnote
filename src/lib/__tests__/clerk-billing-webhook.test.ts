import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseClerkBillingWebhook } from "../clerk-billing-webhook.ts";

describe("parseClerkBillingWebhook", () => {
  it("maps active pro subscription to pro plan", () => {
    const parsed = parseClerkBillingWebhook({
      type: "subscription.updated",
      data: {
        payer_id: "user_123",
        status: "active",
        items: [{ plan: { slug: "pro" } }],
      },
    });

    assert.equal(parsed?.clerkUserId, "user_123");
    assert.equal(parsed?.plan, "pro");
    assert.equal(parsed?.billingStatus, "active");
  });

  it("downgrades canceled subscriptions to free with canceled status", () => {
    const parsed = parseClerkBillingWebhook({
      type: "subscription.deleted",
      data: {
        payer_id: "user_456",
        status: "canceled",
      },
    });

    assert.equal(parsed?.plan, "free");
    assert.equal(parsed?.billingStatus, "canceled");
  });

  it("blocks past due subscriptions", () => {
    const parsed = parseClerkBillingWebhook({
      type: "subscription.updated",
      data: {
        payer_id: "user_789",
        status: "past_due",
        items: [{ plan: { slug: "starter" } }],
      },
    });

    assert.equal(parsed?.plan, "free");
    assert.equal(parsed?.billingStatus, "past_due");
  });

  it("treats trial status as canceled because free trials are disabled", () => {
    const parsed = parseClerkBillingWebhook({
      type: "subscription.updated",
      data: {
        payer_id: "user_trial",
        status: "trialing",
        items: [{ plan: { slug: "pro" } }],
      },
    });

    assert.equal(parsed?.plan, "free");
    assert.equal(parsed?.billingStatus, "canceled");
  });
});
