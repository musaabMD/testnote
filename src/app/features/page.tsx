import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  BookMarked,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  FileStack,
  History,
  Layers,
  Library,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PublicHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Quiz mode, exam mode, review, flashcards, library, analysis, and sessions in DrNote.",
  alternates: {
    canonical: "/features",
  },
};

type FeatureKind =
  | "upload"
  | "quiz"
  | "exam"
  | "review"
  | "flashcards"
  | "library"
  | "analysis"
  | "sessions";

type FeatureStory = {
  title: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  kind: FeatureKind;
  accent: string;
  proof: string[];
};

const FEATURE_STORIES: FeatureStory[] = [
  {
    title: "File to questions",
    eyebrow: "Start from any study source",
    description:
      "Upload PDFs, images, or pasted text and DrNote turns the source into clean questions you can review before practicing.",
    icon: FileStack,
    kind: "upload",
    accent: "text-sky-700 bg-sky-100",
    proof: ["PDFs", "Images", "Pasted notes"],
  },
  {
    title: "Quiz mode",
    eyebrow: "Practice with feedback",
    description:
      "Answer one question at a time, check the result immediately, and keep moving without losing your place.",
    icon: CheckSquare,
    kind: "quiz",
    accent: "text-violet-700 bg-violet-100",
    proof: ["Instant result", "Pause anytime", "Resume later"],
  },
  {
    title: "Exam mode",
    eyebrow: "Train under pressure",
    description:
      "Run timed sessions with answer review held until the end, so practice feels closer to the real exam.",
    icon: Clock,
    kind: "exam",
    accent: "text-amber-700 bg-amber-100",
    proof: ["Timer", "No hints", "Final review"],
  },
  {
    title: "Review",
    eyebrow: "Clean up every question",
    description:
      "Browse extracted questions, filter by status, and open explanations when you need to understand a missed concept.",
    icon: BookMarked,
    kind: "review",
    accent: "text-emerald-700 bg-emerald-100",
    proof: ["Filters", "Explanations", "Status labels"],
  },
  {
    title: "Flashcards",
    eyebrow: "Memorize one idea at a time",
    description:
      "Flip through focused cards, reveal the answer when ready, and repeat the set until the facts stick.",
    icon: Layers,
    kind: "flashcards",
    accent: "text-cyan-700 bg-cyan-100",
    proof: ["Reveal answer", "Card sets", "Quick repeats"],
  },
  {
    title: "Library",
    eyebrow: "Keep sources organized",
    description:
      "Save files and study material in one library, then jump back into the source or practice mode fast.",
    icon: Library,
    kind: "library",
    accent: "text-indigo-700 bg-indigo-100",
    proof: ["Sources", "Bookmarks", "Fast access"],
  },
  {
    title: "Analysis",
    eyebrow: "See what needs work",
    description:
      "Review completed quizzes and exams to spot score patterns, missed questions, and weaker topics.",
    icon: BarChart3,
    kind: "analysis",
    accent: "text-blue-700 bg-blue-100",
    proof: ["Scores", "Missed items", "Trends"],
  },
  {
    title: "Sessions",
    eyebrow: "Track every attempt",
    description:
      "Every quiz and exam run is saved, making it easy to return to past work and measure progress over time.",
    icon: History,
    kind: "sessions",
    accent: "text-teal-700 bg-teal-100",
    proof: ["History", "Progress", "Retakes"],
  },
];

function MiniWindow({
  feature,
  children,
}: {
  feature: FeatureStory;
  children: React.ReactNode;
}) {
  const Icon = feature.icon;

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="flex h-11 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4">
        <span className="size-2.5 rounded-full bg-red-300" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-emerald-300" />
        <div className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-500">
          <Icon className="size-3.5" aria-hidden />
          <span>{feature.title}</span>
        </div>
      </div>
      <div className="min-h-[260px] bg-[#f8fbf7] p-5 sm:p-6">{children}</div>
    </figure>
  );
}

function UploadPreview() {
  return (
    <div className="grid h-full gap-4 md:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-lg border border-dashed border-sky-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-black uppercase text-sky-700">
            Source
          </span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
            42 pages
          </span>
        </div>
        <div className="space-y-2">
          <span className="block h-3 rounded-full bg-slate-200" />
          <span className="block h-3 w-11/12 rounded-full bg-slate-200" />
          <span className="block h-3 w-9/12 rounded-full bg-slate-200" />
          <span className="mt-5 block h-24 rounded-lg bg-gradient-to-br from-sky-100 via-white to-emerald-100" />
        </div>
      </div>
      <div className="grid gap-3">
        {["Define nephrotic syndrome", "Best marker of dehydration", "First-line asthma therapy"].map(
          (question, index) => (
            <div
              className="rounded-lg border border-slate-200 bg-white p-3"
              key={question}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">
                  {index + 1}
                </span>
                <span className="text-sm font-black text-slate-950">
                  Question ready
                </span>
              </div>
              <p className="text-xs font-semibold leading-5 text-slate-500">
                {question}
              </p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function QuizPreview() {
  return (
    <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs font-black uppercase text-violet-700">
            Question 8 of 24
          </span>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
            Practice
          </span>
        </div>
        <h3 className="text-lg font-black leading-tight text-slate-950">
          Which finding best supports the diagnosis?
        </h3>
        <div className="mt-5 grid gap-2">
          {["A. Fever", "B. Proteinuria", "C. Dry cough", "D. Headache"].map(
            (answer, index) => (
              <div
                className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                  index === 1
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
                key={answer}
              >
                {answer}
              </div>
            ),
          )}
        </div>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="size-8 text-emerald-700" aria-hidden />
        <p className="mt-4 text-sm font-black text-emerald-900">
          Correct answer
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-emerald-800/80">
          Immediate feedback confirms the choice and keeps the session moving.
        </p>
      </div>
    </div>
  );
}

function ExamPreview() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-black uppercase text-amber-700">
            Mock exam
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-950">
            Respiratory Block
          </h3>
        </div>
        <div className="rounded-lg bg-slate-950 px-4 py-2 text-right text-white">
          <span className="block text-[11px] font-bold text-white/60">
            Time left
          </span>
          <span className="text-lg font-black">38:12</span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-8">
        {Array.from({ length: 24 }, (_, index) => (
          <span
            className={`grid aspect-square place-items-center rounded-md text-xs font-black ${
              index < 15
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-500"
            }`}
            key={index}
          >
            {index + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReviewPreview() {
  const rows = [
    ["Missed", "Cardiac output equation"],
    ["Review", "Renal filtration marker"],
    ["Strong", "Asthma severity signs"],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase text-emerald-700">
          Filtered list
        </p>
        <div className="mt-4 grid gap-2">
          {rows.map(([status, title]) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3"
              key={title}
            >
              <span className="min-w-0 truncate text-sm font-bold text-slate-700">
                {title}
              </span>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-white p-4">
        <p className="text-xs font-black uppercase text-emerald-700">
          Explanation
        </p>
        <h3 className="mt-4 text-lg font-black leading-tight text-slate-950">
          Why the selected answer is correct
        </h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
          Keep the original question, answer, and reasoning in one focused
          review panel.
        </p>
      </div>
    </div>
  );
}

function FlashcardPreview() {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_0.8fr]">
      <div className="rounded-lg border border-cyan-200 bg-white p-6 text-center">
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black uppercase text-cyan-700">
          Card 12
        </span>
        <h3 className="mx-auto mt-8 max-w-sm text-2xl font-black leading-tight text-slate-950">
          What is the mechanism of loop diuretics?
        </h3>
        <div className="mx-auto mt-8 h-2 max-w-xs rounded-full bg-slate-100">
          <span className="block h-2 w-2/3 rounded-full bg-cyan-500" />
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-cyan-50 p-4">
        <p className="text-xs font-black uppercase text-cyan-800">
          Revealed answer
        </p>
        <p className="mt-4 text-sm font-bold leading-6 text-cyan-900">
          Blocks NKCC2 in the thick ascending limb, reducing sodium and water
          reabsorption.
        </p>
      </div>
    </div>
  );
}

function LibraryPreview() {
  return (
    <div className="grid gap-4 md:grid-cols-[0.75fr_1.25fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase text-indigo-700">Folders</p>
        <div className="mt-4 grid gap-2">
          {["Cardiology", "Pharmacology", "Past papers"].map((item, index) => (
            <div
              className={`rounded-lg px-3 py-2 text-sm font-black ${
                index === 0
                  ? "bg-indigo-100 text-indigo-800"
                  : "bg-slate-50 text-slate-500"
              }`}
              key={item}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase text-indigo-700">
          Saved sources
        </p>
        <div className="mt-4 grid gap-3">
          {["Lecture notes.pdf", "ECG image set", "Final review outline"].map(
            (item) => (
              <div
                className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-3"
                key={item}
              >
                <span className="truncate text-sm font-bold text-slate-700">
                  {item}
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400" />
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisPreview() {
  return (
    <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-lg border border-blue-200 bg-white p-4">
        <p className="text-xs font-black uppercase text-blue-700">
          Latest score
        </p>
        <div className="mt-6 text-5xl font-black text-slate-950">84%</div>
        <p className="mt-2 text-sm font-bold text-slate-500">
          Up 11 points from last week
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase text-blue-700">
          Topic trend
        </p>
        <div className="mt-5 flex h-36 items-end gap-3">
          {[44, 68, 52, 76, 92].map((height, index) => (
            <span
              className="flex-1 rounded-t-md bg-blue-500/80"
              key={height + index}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionsPreview() {
  const sessions = [
    ["Today", "Quiz practice", "18/22"],
    ["Mon", "Timed exam", "72%"],
    ["Fri", "Flashcards", "41 cards"],
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-black uppercase text-teal-700">
        Session history
      </p>
      <div className="mt-5 grid gap-3">
        {sessions.map(([day, title, result]) => (
          <div
            className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-lg bg-slate-50 px-3 py-3"
            key={title}
          >
            <span className="rounded-md bg-white px-2 py-1 text-center text-xs font-black text-teal-700">
              {day}
            </span>
            <span className="min-w-0 truncate text-sm font-bold text-slate-700">
              {title}
            </span>
            <span className="text-xs font-black text-slate-500">{result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureArtwork({ feature }: { feature: FeatureStory }) {
  return (
    <MiniWindow feature={feature}>
      {feature.kind === "upload" ? <UploadPreview /> : null}
      {feature.kind === "quiz" ? <QuizPreview /> : null}
      {feature.kind === "exam" ? <ExamPreview /> : null}
      {feature.kind === "review" ? <ReviewPreview /> : null}
      {feature.kind === "flashcards" ? <FlashcardPreview /> : null}
      {feature.kind === "library" ? <LibraryPreview /> : null}
      {feature.kind === "analysis" ? <AnalysisPreview /> : null}
      {feature.kind === "sessions" ? <SessionsPreview /> : null}
    </MiniWindow>
  );
}

function FeatureArticle({ feature }: { feature: FeatureStory }) {
  const Icon = feature.icon;

  return (
    <article className="grid gap-5">
      <FeatureArtwork feature={feature} />
      <div>
        <div className="flex items-center gap-3">
          <span className={`grid size-10 place-items-center rounded-lg ${feature.accent}`}>
            <Icon className="size-5" aria-hidden />
          </span>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            {feature.eyebrow}
          </p>
        </div>
        <h2 className="mt-4 font-[family-name:var(--font-sora)] text-2xl font-black leading-tight text-slate-950">
          {feature.title}
        </h2>
        <p className="mt-3 text-base font-medium leading-7 text-slate-600">
          {feature.description}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {feature.proof.map((item) => (
            <span
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function FeaturesPage() {
  const [primaryFeature, ...secondaryFeatures] = FEATURE_STORIES;

  return (
    <main className="min-h-screen bg-[#f5faf4] text-slate-950">
      <PublicHeader />

      <section className="mx-auto max-w-[930px] px-5 pb-12 pt-16 text-center sm:px-6 sm:pb-16 sm:pt-24">
        <div className="mx-auto grid size-12 place-items-center rounded-lg border border-emerald-200 bg-white shadow-sm">
          <Sparkles className="size-6 text-emerald-700" aria-hidden />
        </div>
        <h1 className="mx-auto mt-7 max-w-3xl font-[family-name:var(--font-sora)] text-4xl font-black leading-[1.05] tracking-tight text-slate-950 sm:text-6xl">
          Features that turn files into study sessions.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg font-medium leading-8 text-slate-600">
          DrNote keeps the workflow simple: bring in your source, generate
          questions, practice in the right mode, and review progress from every
          attempt.
        </p>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-24 sm:px-6">
        <FeatureArticle feature={primaryFeature} />

        <div className="mt-20 grid gap-x-8 gap-y-16 lg:grid-cols-2">
          {secondaryFeatures.map((feature) => (
            <FeatureArticle feature={feature} key={feature.title} />
          ))}
        </div>
      </section>

      <section className="border-t border-emerald-900/10 bg-white">
        <div className="mx-auto grid max-w-[1120px] gap-6 px-5 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="font-[family-name:var(--font-sora)] text-3xl font-black tracking-tight text-slate-950">
              Try the workflow with your own notes.
            </h2>
            <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-slate-600">
              Upload a file, generate questions, and choose the study mode that
              matches what you need today.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98]"
            >
              Upload a file
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:text-slate-950 active:scale-[0.98]"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
