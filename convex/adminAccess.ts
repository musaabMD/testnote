export function isAdminClerkUserId(clerkUserId: string): boolean {
  const raw = process.env.ADMIN_CLERK_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return ids.includes(clerkUserId);
}
