type DisplayUser = {
  fullName?: string | null;
  firstName?: string | null;
  username?: string | null;
  primaryEmailAddress?: {
    emailAddress?: string | null;
  } | null;
};

export function getUserDisplayName(user?: DisplayUser | null) {
  if (!user) return "You";

  const emailPrefix = user.primaryEmailAddress?.emailAddress?.split("@")[0]?.trim();

  return (
    user.fullName?.trim() ||
    user.firstName?.trim() ||
    user.username?.trim() ||
    emailPrefix ||
    "You"
  );
}
