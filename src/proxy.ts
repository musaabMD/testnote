import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/admin(.*)",
  "/dashboard(.*)",
  "/pdf(.*)",
]);
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const isCronWorkerRoute = createRouteMatcher(["/api/pdf/mcqs/worker"]);

const clerkProxy = clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      if (isCronWorkerRoute(req)) return;
      if (isProtectedRoute(req)) {
        await auth.protect();
      }
    })
  : null;

function localProxy() {
  return NextResponse.next();
}

export default clerkProxy ?? localProxy;

export const config = {
  matcher: [
    "/((?!api/pdf/mcqs/worker|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|ttf|woff2?|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
