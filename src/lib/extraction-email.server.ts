import { isConvexStorageConfigured } from "@/lib/server-storage.server";

export async function sendExtractionJobEmail(args: {
  clerkUserId: string;
  fileName: string;
  status: "ready" | "needs_review" | "failed";
  questionCount?: number;
  needsReviewCount?: number;
  error?: string;
}): Promise<void> {
  if (!isConvexStorageConfigured() || args.clerkUserId.startsWith("anon:")) return;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await client.mutation(api.emails.sendExtractionJobEmail, {
      secret: process.env.EXTRACTION_STORAGE_SECRET!,
      ...args,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[extraction-email] send failed:", error);
    }
  }
}
