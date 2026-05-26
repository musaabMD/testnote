import type { Metadata } from "next";
import { BillingActions } from "@/components/billing-actions";
import { PricingPlans } from "@/components/pricing-plans";
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
    <main className="min-h-screen bg-white font-[family-name:var(--font-dm-sans)] text-slate-950">
      <PublicHeader />

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-slate-500">Pricing</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-black text-slate-950 sm:text-4xl">
              Plans for serious exam prep.
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              Upload medical PDFs, extract reliable questions, review source-backed
              answers, and study with the AI tutor.
            </p>
          </div>

          <div className="shrink-0">
            <BillingActions />
          </div>
        </div>
      </section>

      <section className="px-5 py-8 sm:px-6 sm:py-10">
        <PricingPlans />
      </section>
    </main>
  );
}
