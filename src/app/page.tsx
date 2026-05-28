import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ConversionEventOnMount } from "@/components/conversion-event-on-mount";
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
    <main className="min-h-screen bg-[#f7fbf8] text-slate-950">
      <ConversionEventOnMount
        eventName="landing_viewed"
        properties={{ surface: "homepage" }}
      />
      <PublicHeader />

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[1680px] grid-cols-1 gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[0.76fr_1.24fr] lg:gap-16 lg:px-14 lg:py-16 xl:px-20">
        <div className="lg:pt-3">
          <h1 className="max-w-[620px] font-[family-name:var(--font-sora)] text-[3.1rem] font-black leading-[1.08] tracking-tight text-slate-900 sm:text-[4.6rem] lg:text-[4.9rem] xl:text-[5.55rem]">
            All these study questions have the same answer: Yes!
          </h1>
        </div>

        <div className="lg:justify-self-end">
          <ul className="w-full max-w-[1040px] space-y-3">
            {studyQuestions.map((question, index) => (
              <li
                key={index}
                className="flex items-start gap-3 font-[family-name:var(--font-dm-sans)] text-[1.32rem] font-medium leading-[1.16] text-slate-800 sm:gap-4 sm:text-[1.62rem] lg:text-[1.7rem] xl:text-[1.86rem]"
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

      <section className="border-t border-emerald-100 bg-white px-6 py-12 sm:px-10">
        <div className="mx-auto grid max-w-[1180px] gap-5 sm:grid-cols-3">
          {[
            ["Upload", "Bring in a PDF, image, or pasted notes."],
            ["Extract", "Let DrNote find usable practice questions."],
            ["Practice", "Review, quiz, flashcard, or sit a mock exam."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[8px] border border-slate-200 p-5">
              <span className="text-sm font-black uppercase tracking-[0.08em] text-emerald-700">
                {title}
              </span>
              <p className="mt-2 text-base font-medium leading-7 text-slate-600">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
