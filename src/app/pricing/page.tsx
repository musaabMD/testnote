import type { Metadata } from "next";
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
      <section id="plans" className="overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
        <PricingPlans />
      </section>
    </main>
  );
}
