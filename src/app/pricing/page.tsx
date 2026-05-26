import type { Metadata } from "next";
import { PricingTable } from "@clerk/nextjs";
import { BillingActions } from "@/components/billing-actions";
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

      <section className="mx-auto px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col items-center text-center sm:mb-12">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Save hours, learn smarter.
            </h1>
            <p className="mt-3 max-w-lg text-base leading-7 text-slate-500">
              Pick a plan to unlock AI extraction, quizzes, and tutoring.
            </p>
            <div className="mt-5">
              <BillingActions />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
            <PricingTable
              ctaPosition="bottom"
              for="user"
              highlightedPlan={process.env.NEXT_PUBLIC_CLERK_BILLING_HIGHLIGHTED_PLAN ?? "pro"}
              newSubscriptionRedirectUrl="/dashboard"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
