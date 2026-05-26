"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadProgressToast } from "@/components/upload-progress-toast";
import { convex } from "@/lib/convex-client";
import { useAuth } from "@clerk/nextjs";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export { convex };

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) {
    return (
      <ConvexProvider client={convex}>
        <TooltipProvider>
          {children}
          <UploadProgressToast />
        </TooltipProvider>
      </ConvexProvider>
    );
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <TooltipProvider>
        {children}
        <UploadProgressToast />
      </TooltipProvider>
    </ConvexProviderWithClerk>
  );
}
