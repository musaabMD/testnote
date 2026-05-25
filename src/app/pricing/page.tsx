import type { Metadata } from "next";
import { PricingTable } from "@clerk/nextjs";
import { PublicHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Choose the DrNote plan that fits your study workflow, upload volume, and AI tutor usage.",
  alternates: {
    canonical: "/pricing",
  },
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f8] font-[family-name:var(--font-dm-sans)] text-slate-950">
      <PublicHeader />

      <section className="mx-auto bg-white px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col items-center text-center sm:mb-12">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Save hours, learn smarter.
            </h1>
            <p className="mt-3 max-w-lg text-base leading-7 text-slate-500">
              Choose a plan and manage your subscription through Clerk Billing.
            </p>
          </div>

          <PricingTable
            ctaPosition="bottom"
            for="user"
            highlightedPlan={process.env.NEXT_PUBLIC_CLERK_BILLING_HIGHLIGHTED_PLAN ?? "pro"}
            newSubscriptionRedirectUrl="/dashboard"
          />

          <p className="mt-10 text-center text-sm text-slate-400">
            Billing is managed through Clerk. Need a custom plan or launch help?{" "}
            <a
              href="/support"
              className="font-medium text-slate-600 underline-offset-2 hover:underline"
            >
              Contact us
            </a>{" "}
            or email{" "}
            <a
              href="mailto:support@drnote.co"
              className="font-medium text-slate-600 underline-offset-2 hover:underline"
            >
              support@drnote.co
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
