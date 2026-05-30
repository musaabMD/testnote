import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ConversionEventOnMount } from "@/components/conversion-event-on-mount";
import { HeroRotatingLine } from "@/components/hero-feature-rotator";
import { QBankUpload } from "@/components/qbank-upload";
import { PublicHeader } from "@/components/site-header";

function Keyword({ children }: { children: React.ReactNode }) {
  return (
    <span className="box-decoration-clone bg-[#dcecff] px-1 font-black text-slate-950 shadow-[inset_0_-0.28em_0_#8bbfff]">
      {children}
    </span>
  );
}

export const metadata: Metadata = {
  title: "AI Study Notes and Quiz Generator",
  description:
    "Upload PDFs, images, or notes and turn them into reviewable questions, quizzes, flashcards, and exam practice.",
  alternates: {
    canonical: "/",
  },
};

const studyQuestions = [
  <>
    Can I turn <Keyword>lecture PDFs</Keyword> into{" "}
    <Keyword>practice questions</Keyword>?
  </>,
  <>
    Can I upload <Keyword>images</Keyword>, <Keyword>PDFs</Keyword>, and{" "}
    <Keyword>pasted notes</Keyword>?
  </>,
  <>
    Can I study from the <Keyword>source page</Keyword> beside every{" "}
    <Keyword>question</Keyword>?
  </>,
  <>
    Can I fix <Keyword>grammar</Keyword> without changing the{" "}
    <Keyword>answer</Keyword>?
  </>,
  <>
    Can I generate <Keyword>quizzes</Keyword> from{" "}
    <Keyword>messy class handouts</Keyword>?
  </>,
  <>
    Can I practice in <Keyword>timed exam mode</Keyword>?
  </>,
  <>
    Can I review <Keyword>missed questions</Keyword> after each{" "}
    <Keyword>session</Keyword>?
  </>,
  <>
    Can I save every file in a <Keyword>searchable study library</Keyword>?
  </>,
  <>
    Can I make <Keyword>flashcards</Keyword> from the same{" "}
    <Keyword>extracted questions</Keyword>?
  </>,
  <>
    Can I <Keyword>pause a quiz</Keyword> and <Keyword>resume later</Keyword>?
  </>,
  <>
    Can I see which <Keyword>sources</Keyword> still need{" "}
    <Keyword>review</Keyword>?
  </>,
  <>
    Can I track <Keyword>scores</Keyword> across <Keyword>quizzes</Keyword> and{" "}
    <Keyword>mock exams</Keyword>?
  </>,
  <>
    Can I ask an <Keyword>AI tutor</Keyword> about a question?
  </>,
  <>
    Can I keep <Keyword>exam prep</Keyword> organized by{" "}
    <Keyword>subject</Keyword>?
  </>,
  <>
    Can I study from <Keyword>notes</Keyword> without{" "}
    <Keyword>rebuilding them by hand</Keyword>?
  </>,
  <>
    Can I go from <Keyword>file upload</Keyword> to{" "}
    <Keyword>revision in minutes</Keyword>?
  </>,
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
