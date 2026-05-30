import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";

const DEFAULT_ADMIN_EMAIL = "mousab.r@gmail.com,mousab.r@me.com";

function configuredAdminEmails() {
  return (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function assertAdmin(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Not authenticated");
  }

  const adminEmails = configuredAdminEmails();
  const identityEmail =
    typeof identity.email === "string" ? identity.email.toLowerCase() : undefined;

  if (!identityEmail || !adminEmails.includes(identityEmail)) {
    throw new ConvexError("Admin access required");
  }

  return identity;
}
