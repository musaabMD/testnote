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
