import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeUserFacingError } from "../user-facing-error.server.ts";

test("sanitizeUserFacingError strips npm sandbox errors", () => {
  const raw =
    "npm error code ENOENT npm error syscall mkdir npm error path /home/sbx_user1051";
  assert.equal(
    sanitizeUserFacingError(raw),
    "Extraction failed temporarily. Please try again.",
  );
});

test("sanitizeUserFacingError preserves normal messages", () => {
  assert.equal(
    sanitizeUserFacingError("No questions were found in this file."),
    "No questions were found in this file.",
  );
});
