import { ExamLikeUiHoverPreview } from "@/components/exam-like-ui-hover-preview";

type LearningMode = {
  label: string;
  icon: string;
  soon?: boolean;
};

const learningModes: LearningMode[] = [
  { label: "Library", icon: "ti-books" },
  { label: "Study mode", icon: "ti-school" },
  { label: "Flashcards", icon: "ti-cards" },
  { label: "QBank", icon: "ti-list-check" },
  { label: "Summaries", icon: "ti-file-text" },
  { label: "Mock mode", icon: "ti-certificate" },
  { label: "Review mode", icon: "ti-rotate-clockwise-2" },
  { label: "Ask", icon: "ti-message-chatbot" },
  { label: "Personalized learning", icon: "ti-sparkles" },
  { label: "Mind maps", icon: "ti-sitemap", soon: true },
  { label: "Last min review", icon: "ti-alarm" },
  { label: "Predict next exam", icon: "ti-chart-dots-3" },
  { label: "Self assessment exam", icon: "ti-clipboard-check" },
];

function LearningModeBadge({ mode }: { mode: LearningMode }) {
  return (
    <li className="min-w-0">
      <span
        className={`flex h-full w-full min-h-[3.25rem] items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-2.5 py-2 text-left shadow-sm sm:px-3 ${
          mode.soon
            ? "cursor-default opacity-70"
            : "transition duration-200 hover:border-slate-300 hover:shadow-md"
        }`}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <i
            className={`ti ${mode.icon} text-[17px] leading-none`}
            aria-hidden
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-xs leading-snug font-semibold text-slate-800 sm:text-sm">
            {mode.label}
          </span>
          {mode.soon ? (
            <span className="w-fit rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold tracking-wide text-slate-500 uppercase">
              Soon
            </span>
          ) : null}
        </span>
      </span>
    </li>
  );
}

export function LearningHqBadges() {
  return (
    <section
      id="study-modes"
      aria-labelledby="learning-hq-heading"
      className="mt-8 w-full max-w-4xl scroll-mt-24 overflow-visible sm:mt-9"
    >
      <div className="overflow-visible rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_32px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 sm:px-5 sm:text-base">
            <span className="grid size-8 place-items-center rounded-full bg-white text-slate-600 shadow-sm">
              <i
                className="ti ti-layout-dashboard text-lg leading-none"
                aria-hidden
              />
            </span>
            Your Learning HQ
          </span>
          <p
            id="learning-hq-heading"
            className="max-w-md text-sm text-slate-500 sm:text-[15px]"
          >
            One home for every way you study — pick a mode and go.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2 overflow-visible sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4">
          {learningModes.map((mode) => (
            <LearningModeBadge key={mode.label} mode={mode} />
          ))}
          <ExamLikeUiHoverPreview />
        </ul>
      </div>
    </section>
  );
}
