"use client";

import {
  CheckCircle,
  Clock,
  FileUp,
  Layers,
} from "lucide-react";
import {
  PdfStudyPanel,
  getQuestionId,
  type QuestionAnswer,
  type StudyMode,
} from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem, PdfMcq } from "@/lib/pdf-mcqs";

const demoQuestions: PdfMcq[] = [
  {
    questionId: "q1",
    questionNumber: 1,
    question:
      "A 24-year-old student keeps rereading lecture slides but forgets key mechanisms. Which study method best improves long-term recall?",
    options: [
      { label: "A", text: "Passive rereading without testing" },
      { label: "B", text: "Active recall with spaced flashcards" },
      { label: "C", text: "Highlighting every paragraph" },
      { label: "D", text: "Studying only the night before" },
    ],
    correctAnswer: "B",
    explanation:
      "Active recall plus spacing repeatedly retrieves the concept, which strengthens memory and exposes weak areas.",
    sourcePage: 3,
  },
  {
    questionId: "q2",
    questionNumber: 2,
    question:
      "Which feature helps a learner practice under real exam pressure?",
    options: [
      { label: "A", text: "Timed exam mode with hidden answers" },
      { label: "B", text: "Only reading the summary" },
      { label: "C", text: "Removing the question list" },
      { label: "D", text: "Skipping explanations" },
    ],
    correctAnswer: "A",
    explanation:
      "Exam mode keeps feedback hidden until the end, so the session feels closer to the real test environment.",
    sourcePage: 5,
  },
  {
    questionId: "q3",
    questionNumber: 3,
    question:
      "After answering questions, what should the student review first?",
    options: [
      { label: "A", text: "Correct answers only" },
      { label: "B", text: "Questions marked incorrect or uncertain" },
      { label: "C", text: "The file name" },
      { label: "D", text: "Unrelated topics" },
    ],
    correctAnswer: "B",
    explanation:
      "Targeting missed or uncertain questions focuses review time on the highest-yield gaps.",
    sourcePage: 8,
  },
];

const demoFile: PdfFileQueueItem = {
  id: "feature-snapshot-demo",
  name: "Study Skills Quick Review.pdf",
  pageCount: 12,
  status: "completed",
  source: {
    mimeType: "application/pdf",
    name: "Study Skills Quick Review.pdf",
    url: "/",
  },
  result: {
    title: "Study Skills Quick Review",
    summary:
      "A compact review covering active recall, timed practice, and targeted feedback.",
    mcqs: demoQuestions,
  },
};

const reel = [
  {
    id: "upload",
    label: "Upload",
    title: "Upload notes",
    subtitle: "PDF, image, or pasted text becomes study material.",
    icon: FileUp,
    accent: "bg-sky-100 text-sky-700",
  },
  {
    id: "flashcards",
    label: "Flashcards",
    title: "Review with cards",
    subtitle: "Flip through concepts and mark what is learned.",
    icon: Layers,
    accent: "bg-violet-100 text-violet-700",
  },
  {
    id: "quiz",
    label: "Quiz",
    title: "Practice questions",
    subtitle: "Answer choices get instant feedback and explanations.",
    icon: CheckCircle,
    accent: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "exam",
    label: "Exam",
    title: "Simulate pressure",
    subtitle: "Timed exam-style practice keeps answers hidden.",
    icon: Clock,
    accent: "bg-amber-100 text-amber-700",
  },
] as const;

const studyModeBySlide: Partial<Record<(typeof reel)[number]["id"], StudyMode>> = {
  flashcards: "flashcards",
  quiz: "quiz",
  exam: "exam",
};

const slideIds = new Set<string>(reel.map((item) => item.id));

function buildAnsweredState(): Record<string, QuestionAnswer> {
  const firstQuestion = demoQuestions[0]!;
  return {
    [getQuestionId(demoFile, firstQuestion, 0)]: {
      selected: "B",
      isCorrect: true,
    },
  };
}

function UploadPreview() {
  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-5 px-6 py-8">
      <div className="rounded-[28px] border-2 border-dashed border-sky-200 bg-sky-50/70 px-8 py-10 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-white text-sky-600 shadow-sm">
          <FileUp className="size-8" aria-hidden />
        </div>
        <h2 className="mt-5 font-[family-name:var(--font-sora)] text-3xl font-black text-slate-950">
          Drop your notes here
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
          DrNote extracts clean questions, flashcards, and exam sessions from
          one upload.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["PDF", "Images", "Text", "Markdown"].map((item) => (
            <span
              className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-black text-sky-700"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["1", "Upload"],
          ["2", "Extract"],
          ["3", "Study"],
        ].map(([number, label]) => (
          <div
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            key={label}
          >
            <span className="grid size-8 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">
              {number}
            </span>
            <p className="mt-3 text-sm font-black text-slate-900">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeatureSnapshotClient({ slideId }: { slideId: string }) {
  const activeIndex = slideIds.has(slideId)
    ? reel.findIndex((item) => item.id === slideId)
    : 0;
  const answeredState = buildAnsweredState();
  const activeSlide = reel[activeIndex]!;
  const ActiveIcon = activeSlide.icon;
  const activeMode = studyModeBySlide[activeSlide.id];
  const mode = activeMode ?? "flashcards";

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-8 py-8 text-slate-950">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1180px] grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.12)]">
        <aside className="flex flex-col border-r border-slate-200 bg-slate-950 p-7 text-white">
          <div>
            <p className="font-[family-name:var(--font-sora)] text-2xl font-black">
              DrNote
            </p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
              Turn one upload into every study mode.
            </p>
          </div>

          <div className="mt-10 space-y-2">
            {reel.map((item, index) => {
              const Icon = item.icon;
              const selected = index === activeIndex;
              return (
                <button
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    selected
                      ? "bg-white text-slate-950"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                  key={item.id}
                  onClick={() => {
                    window.location.href = `/feature-snapshot?slide=${item.id}`;
                  }}
                  type="button"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                      selected ? item.accent : "bg-white/10 text-slate-300"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-black">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto rounded-3xl border border-white/10 bg-white/10 p-4">
            <div className={`grid size-12 place-items-center rounded-2xl ${activeSlide.accent}`}>
              <ActiveIcon className="size-6" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl font-black leading-tight">
              {activeSlide.title}
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
              {activeSlide.subtitle}
            </p>
          </div>
        </aside>

        <div className="min-w-0 overflow-hidden bg-white">
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Feature snapshot
              </p>
              <p className="text-sm font-bold text-slate-700">
                {demoFile.name} · {demoQuestions.length} sample questions
              </p>
            </div>
            <div className="flex gap-1.5">
              {reel.map((item, index) => (
                <span
                  className={`h-2 rounded-full transition-all ${
                    index === activeIndex ? "w-8 bg-slate-950" : "w-2 bg-slate-200"
                  }`}
                  key={item.id}
                />
              ))}
            </div>
          </div>

          <div className="h-[calc(100%-4rem)] overflow-hidden bg-white">
            {activeSlide.id === "upload" ? (
              <UploadPreview />
            ) : (
              <div className="mx-auto h-full max-w-[820px] overflow-hidden px-5 py-6">
                <PdfStudyPanel
                  bookmarkedQuestionIds={new Set()}
                  file={demoFile}
                  mode={mode}
                  onModeChange={(nextMode) => {
                    const nextIndex = reel.findIndex((item) => item.id === nextMode);
                    if (nextIndex >= 0) {
                      window.location.href = `/feature-snapshot?slide=${reel[nextIndex]!.id}`;
                    }
                  }}
                  onRecordAnswer={() => {}}
                  onToggleBookmark={() => {}}
                  questionAnswers={mode === "quiz" ? answeredState : {}}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
