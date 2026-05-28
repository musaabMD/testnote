import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
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
    <main className="min-h-screen bg-slate-50 font-[family-name:var(--font-dm-sans)] text-slate-950">
      <PublicHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-9 sm:px-6 sm:py-11 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase text-emerald-700">
              Pricing
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
              Turn medical PDFs into exam-ready questions.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
              Pick the plan that matches your upload volume. Every paid plan is
              built around source-backed extraction, quiz review, mock exams, and
              tutor help for dense study files.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#plans"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800"
              >
                Choose your plan
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/features"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                See features
              </Link>
            </div>
          </div>

          <div className="grid gap-4 text-sm font-semibold text-slate-700 sm:grid-cols-3 lg:grid-cols-1">
            {[
              "Extract questions from lecture PDFs and exam banks",
              "Review answers with exact source highlights",
              "Ask the AI tutor for step-by-step explanations",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-emerald-600"
                  aria-hidden
                />
                <span className="leading-6">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="px-5 py-6 sm:px-6 sm:py-8">
        <PricingPlans />
      </section>
    </main>
  );
}
