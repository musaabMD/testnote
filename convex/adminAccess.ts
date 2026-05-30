const DEFAULT_ADMIN_EMAIL = "mousab.r@gmail.com,mousab.r@me.com";

export function isAdminClerkUserId(clerkUserId: string): boolean {
  const raw = process.env.ADMIN_CLERK_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return ids.includes(clerkUserId);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export function isAdminUser(args: {
  clerkUserId: string;
  email?: string | null;
}): boolean {
  return isAdminClerkUserId(args.clerkUserId) || isAdminEmail(args.email);
}
