import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/site-header";
import {
  FEATURE_CARD_CLASS,
  PRODUCT_FEATURES,
} from "@/lib/product-features";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Quiz mode, exam mode, review, flashcards, library, analysis, and sessions in DrNote.",
  alternates: {
    canonical: "/features",
  },
};

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-white font-[family-name:var(--font-dm-sans)] text-slate-950">
      <PublicHeader />

      <section className="mx-auto max-w-[1080px] px-5 py-16 sm:px-6 sm:py-24">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-sky-600">
            Features
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-sora)] text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            All features
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-7 text-slate-500">
            Upload once, then use the study modes that are active today:
            review, quiz, exam, flashcards, library, analysis, and sessions.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_FEATURES.map((feature) => (
            <article key={feature.title} className={FEATURE_CARD_CLASS}>
              <span
                className={`grid size-12 place-items-center rounded-2xl ${feature.color}`}
              >
                <feature.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-black text-slate-950">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {feature.description}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-16 rounded-3xl border border-[#d1d1d1] bg-[#fafafa] px-8 py-10 text-center sm:px-12">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl font-black text-slate-950 sm:text-3xl">
            Ready to try it?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
            Upload a file and see questions in seconds — no setup required.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-full bg-gray-900 px-6 text-sm font-bold text-white transition hover:bg-gray-700 active:scale-[0.97]"
            >
              Upload a file
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 bg-white px-6 text-sm font-bold text-gray-700 transition hover:border-gray-300 hover:text-gray-900 active:scale-[0.97]"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
