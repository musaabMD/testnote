import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "DrNote Admin",
  robots: {
    index: false,
    follow: false,
  },
};

const DEFAULT_ADMIN_EMAIL = "mousab.r@gmail.com,mousab.r@me.com";

function adminEmails() {
  return (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
