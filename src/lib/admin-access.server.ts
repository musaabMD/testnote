const DEFAULT_ADMIN_EMAIL = "mousab.r@gmail.com";

function parseAdminClerkUserIds(): Set<string> {
  const raw = process.env.ADMIN_CLERK_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isAdminClerkUserId(clerkUserId: string | null | undefined): boolean {
  if (!clerkUserId) return false;
  return parseAdminClerkUserIds().has(clerkUserId);
}

function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.trim().toLowerCase());
}

export function isAdminUser(args: {
  clerkUserId: string | null | undefined;
  email?: string | null;
}): boolean {
  return isAdminClerkUserId(args.clerkUserId) || isAdminEmail(args.email);
}
