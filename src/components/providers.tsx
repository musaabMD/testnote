"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SupportWidget } from "@/components/support/support-widget";
import { UploadProgressToast } from "@/components/upload-progress-toast";
import { convex } from "@/lib/convex-client";
import {
  captureConversionEvent,
  identifyConversionUser,
} from "@/lib/conversion-analytics";
import { useAuth, useUser } from "@clerk/nextjs";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export { convex };

function ConversionIdentityBridge() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const trackedDashboardPathRef = useRef("");

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;

    identifyConversionUser(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
      created_at: user.createdAt?.toISOString(),
    });

    const createdAt = user.createdAt?.getTime();
    const recentSignup =
      typeof createdAt === "number" && Date.now() - createdAt < 30 * 60 * 1000;
    const signupStorageKey = `testnote:signup_completed:${user.id}`;

    if (recentSignup && !window.localStorage.getItem(signupStorageKey)) {
      window.localStorage.setItem(signupStorageKey, "1");
      captureConversionEvent("signup_completed", {
        method: "clerk",
        surface: "auth",
      });
    }
  }, [isLoaded, isSignedIn, user]);

  useEffect(() => {
    if (!pathname.startsWith("/dashboard")) return;
    if (trackedDashboardPathRef.current === pathname) return;
    trackedDashboardPathRef.current = pathname;
    captureConversionEvent("dashboard_viewed", { path: pathname });
  }, [pathname]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) {
    return (
      <ConvexProvider client={convex}>
        <TooltipProvider>
          {children}
          <UploadProgressToast />
          <SupportWidget />
        </TooltipProvider>
      </ConvexProvider>
    );
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <TooltipProvider>
        <ConversionIdentityBridge />
        {children}
        <UploadProgressToast />
        <ClerkSupportWidget />
      </TooltipProvider>
    </ConvexProviderWithClerk>
  );
}

function ClerkSupportWidget() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  const displayName =
    user?.firstName ?? user?.fullName ?? user?.username ?? email?.split("@")[0];

  return (
    <SupportWidget
      contactEmail={email ?? undefined}
      userName={displayName ?? undefined}
    />
  );
}
