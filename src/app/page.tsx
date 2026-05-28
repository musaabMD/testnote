import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ConversionEventOnMount } from "@/components/conversion-event-on-mount";
import { HeroRotatingLine } from "@/components/hero-feature-rotator";
import { QBankUpload } from "@/components/qbank-upload";
import { PublicHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "AI Study Notes and Quiz Generator",
  description:
    "Upload PDFs, images, or notes and turn them into reviewable questions, quizzes, flashcards, and exam practice.",
  alternates: {
    canonical: "/",
  },
};

const studyQuestions = [
  <>Can I <strong>turn lecture PDFs into practice questions?</strong></>,
  <>Can I <strong>upload images, PDFs, and pasted notes?</strong></>,
  <>Can I <strong>study from the source page beside every question?</strong></>,
  <>Can I <strong>fix grammar without changing the answer?</strong></>,
  <>Can I <strong>generate quizzes from messy class handouts?</strong></>,
  <>Can I <strong>practice in timed exam mode?</strong></>,
  <>Can I <strong>review missed questions after each session?</strong></>,
  <>Can I <strong>save every file in a searchable study library?</strong></>,
  <>Can I <strong>make flashcards from the same extracted questions?</strong></>,
  <>Can I <strong>pause a quiz and resume later?</strong></>,
  <>Can I <strong>see which sources still need review?</strong></>,
  <>Can I <strong>track scores across quizzes and mock exams?</strong></>,
  <>Can I <strong>ask an AI tutor about a question?</strong></>,
  <>Can I <strong>keep exam prep organized by subject?</strong></>,
  <>Can I <strong>study from notes without rebuilding them by hand?</strong></>,
  <>Can I <strong>go from file upload to revision in minutes?</strong></>,
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <ConversionEventOnMount
        eventName="landing_viewed"
        properties={{ surface: "homepage" }}
      />
      <PublicHeader />

      <section className="border-b border-emerald-100 bg-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[900px] flex-col items-center justify-center px-5 py-14 text-center sm:px-6 sm:py-16">
          <h1 className="max-w-2xl font-[family-name:var(--font-sora)] text-[2.5rem] font-black leading-none tracking-tight text-slate-950 sm:text-6xl">
            <span className="block whitespace-nowrap">Upload file. Get</span>
            <HeroRotatingLine />
          </h1>

          <div id="upload" className="mt-12 w-full max-w-3xl scroll-mt-24">
            <QBankUpload />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1040px] px-6 py-16 sm:px-10">
        <h2 className="mb-8 max-w-3xl font-[family-name:var(--font-sora)] text-[2rem] font-black leading-[1.12] tracking-tight text-slate-900 sm:text-[2.65rem] lg:text-[3.1rem]">
          All these study questions have the same answer: Yes!
        </h2>

        <div>
          <ul className="w-full max-w-[1040px] space-y-3">
            {studyQuestions.map((question, index) => (
              <li
                key={index}
                className="flex items-start gap-3 font-[family-name:var(--font-dm-sans)] text-xl font-medium leading-[1.2] text-slate-800 sm:gap-4 sm:text-2xl lg:text-[1.55rem] xl:text-[1.68rem]"
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#3f7ed9] text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.16)] sm:size-9 lg:size-8 xl:size-9">
                  <Check className="size-5 stroke-[3.4]" aria-hidden />
                </span>
                <span className="min-w-0">
                  {question}
                  <span
                    className="ml-2 inline-block rotate-[-3deg] whitespace-nowrap bg-[#ffdf70] px-2 py-0.5 align-middle font-[family-name:var(--font-sora)] text-[0.66em] font-black leading-none text-slate-950 shadow-[0_1px_0_rgba(15,23,42,0.12)]"
                    aria-label="Yes"
                  >
                    YES!
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
