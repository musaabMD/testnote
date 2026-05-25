"use client";

import { useState, type ReactNode } from "react";

const questions = [
  {
    id: "q1",
    stem: "A 58-year-old with diabetes presents with polyuria and Kussmaul breathing. Most likely diagnosis?",
  },
  {
    id: "q2",
    stem: "Which finding best supports acute inferior MI on ECG?",
    highlight: true,
  },
  {
    id: "q3",
    stem: "First-line therapy for anaphylaxis in the field setting?",
  },
];

export function ExamLikeUiHoverPreview() {
  const [open, setOpen] = useState(false);

  return (
    <li
      className="relative min-w-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="flex h-full w-full min-h-[3.25rem] items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-2.5 py-2 text-left shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md sm:px-3"
        aria-expanded={open}
        aria-describedby={open ? "exam-like-ui-preview" : undefined}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <i
            className="ti ti-device-laptop text-[17px] leading-none"
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1 text-xs leading-snug font-semibold text-slate-800 sm:text-sm">
          Exam-like UI
        </span>
      </button>

      <HoverPanel
        id="exam-like-ui-preview"
        open={open}
        className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-50 w-[min(100vw-2rem,22rem)] -translate-x-1/2 sm:w-[26rem] sm:-translate-x-[30%] lg:-translate-x-1/2"
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-[#faf6f3] p-2.5 shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
          <div className="relative rounded-xl border border-slate-200/70 bg-white p-3 pb-20">
            <p className="mb-2.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Block 1 · Question 12 of 40
            </p>
            <ul className="space-y-1.5">
              {questions.map((q) => (
                <li key={q.id}>
                  <div
                    className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 ${
                      q.highlight && open
                        ? "border-orange-400 bg-orange-50/50"
                        : "border-transparent bg-slate-50/80"
                    }`}
                  >
                    <span className="mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-slate-300" />
                    <p className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug text-slate-700">
                      {q.stem}
                    </p>
                    {q.highlight && open ? (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-orange-500 text-white">
                        <i
                          className="ti ti-message-2 text-[10px] leading-none"
                          aria-hidden
                        />
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <div
              className={`absolute right-1 bottom-2 left-6 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.1)] transition-all duration-200 ease-out ${
                open
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0"
              }`}
              style={{ transitionDelay: open ? "80ms" : "0ms" }}
            >
              <div className="space-y-3">
                <div className="flex gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                      You
                    </span>
                    <p className="text-[11px] font-semibold leading-snug text-slate-900">
                      Why is ST elevation in II, III, aVF significant?
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-orange-500 text-white">
                      <i
                        className="ti ti-bulb text-sm leading-none"
                        aria-hidden
                      />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-900">
                        Exam tutor
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                        Those leads map to the inferior wall — classic for RCA
                        occlusion. Pair with reciprocal ST depression in I, aVL.
                      </p>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </div>
      </HoverPanel>
    </li>
  );
}

function HoverPanel({
  open,
  children,
  className = "",
  id,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      className={`transition-all duration-200 ease-out ${
        open
          ? "visible translate-y-0 opacity-100"
          : "invisible translate-y-2 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
