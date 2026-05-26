import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { FileUp, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";
import { FeatureGrid } from "@/components/feature-grid";
import { HeroRotatingLine } from "@/components/hero-feature-rotator";
import { PublicHeader } from "@/components/site-header";
import {
  FEATURE_CARD_CLASS,
  PRODUCT_FEATURES,
} from "@/lib/product-features";

const PdfDropzone = dynamic(
  () => import("@/components/pdf/pdf-dropzone").then((mod) => mod.PdfDropzone),
  {
    loading: () => (
      <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        Loading upload…
      </div>
    ),
  },
);

export const metadata: Metadata = {
  title: "AI Study Notes and Quiz Generator",
  description:
    "Upload PDFs, images, or notes and turn them into reviewable questions, quizzes, flashcards, and exam practice.",
  alternates: {
    canonical: "/",
  },
};

const steps = [
  {
    icon: FileUp,
    title: "Upload",
    text: "Drop your file or paste text.",
    color: "bg-blue-100 text-blue-600",
  },
  {
    icon: Sparkles,
    title: "Extract",
    text: "Questions are pulled out automatically.",
    color: "bg-violet-100 text-violet-600",
  },
  {
    icon: ListChecks,
    title: "Review",
    text: "Open a clean question list.",
    color: "bg-emerald-100 text-emerald-600",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicHeader />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[860px] flex-col items-center justify-center px-5 py-16 text-center sm:px-6">
        <h1 className="max-w-2xl font-[family-name:var(--font-sora)] text-5xl font-black leading-none tracking-tight text-slate-950 sm:text-6xl">
          <span className="block whitespace-nowrap">Upload file. Get</span>
          <HeroRotatingLine />
        </h1>

        <div className="mt-12 w-full max-w-3xl">
          <PdfDropzone />
        </div>

        <div className="mt-12 grid w-full max-w-2xl gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <div
              className={`flex flex-col items-center px-6 py-6 text-center ${FEATURE_CARD_CLASS}`}
              key={step.title}
            >
              <span className={`grid size-12 place-items-center rounded-2xl ${step.color}`}>
                <step.icon className="size-5" aria-hidden />
              </span>
              <span className="mt-3 block text-base font-black text-slate-950">
                {step.title}
              </span>
              <span className="mt-1 block text-sm leading-5 text-slate-500">
                {step.text}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-5 pb-20 pt-4 sm:px-6">
        <div className="text-center">
          <h2 className="font-[family-name:var(--font-sora)] text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            All features
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-slate-500">
            Current study tools available after upload: question review, quick
            quizzes, flashcards, timed exams, and session history.
          </p>
        </div>

        <div className="mt-12">
          <FeatureGrid features={PRODUCT_FEATURES} />
        </div>

        <p className="mt-10 text-center">
          <Link
            href="/features"
            className="text-sm font-bold text-sky-700 transition hover:text-sky-800"
          >
            View full features page →
          </Link>
        </p>
      </section>
    </main>
  );
}
