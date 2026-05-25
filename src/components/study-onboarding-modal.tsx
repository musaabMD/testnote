"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import {
  DEFAULT_STUDY_PROFILE,
  loadStudyProfile,
  saveStudyProfile,
  type StudyProfile,
} from "@/lib/study-profile";

const LEVELS = [
  { value: "beginner", label: "Beginner", hint: "New to this material" },
  { value: "intermediate", label: "Intermediate", hint: "Comfortable with basics" },
  { value: "advanced", label: "Advanced", hint: "Reviewing for mastery" },
] as const;

const HOURS_OPTIONS = [
  { value: "1-5", label: "1–5 hours" },
  { value: "6-10", label: "6–10 hours" },
  { value: "11-20", label: "11–20 hours" },
  { value: "20+", label: "20+ hours" },
];

const FORMAT_OPTIONS = [
  "Flashcards",
  "QBank",
  "Summaries",
  "Mock exams",
  "Review mode",
];

const GOAL_OPTIONS = [
  "Pass my exam",
  "Improve grades",
  "Stay sharp between terms",
  "Board / licensing prep",
];

const STEP_COUNT = 6;

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

type StudyOnboardingModalProps = {
  open: boolean;
  onClose: () => void;
};

export function StudyOnboardingModal({
  open,
  onClose,
}: StudyOnboardingModalProps) {
  const [profile, setProfile] = useState<StudyProfile>(
    () => loadStudyProfile() ?? DEFAULT_STUDY_PROFILE,
  );
  const [step, setStep] = useState(0);

  if (!open) return null;

  function toggleFormat(format: string) {
    setProfile((current) => ({
      ...current,
      preferredFormats: current.preferredFormats.includes(format)
        ? current.preferredFormats.filter((item) => item !== format)
        : [...current.preferredFormats, format],
    }));
  }

  function handleFinish() {
    saveStudyProfile(profile);
    onClose();
  }

  function goNext() {
    if (step < STEP_COUNT - 1) {
      setStep((current) => current + 1);
      return;
    }
    handleFinish();
  }

  function goBack() {
    if (step > 0) setStep((current) => current - 1);
  }

  const progress = ((step + 1) / STEP_COUNT) * 100;
  const isLastStep = step === STEP_COUNT - 1;
  const canContinue =
    step === 0
      ? profile.examGoal.trim().length > 0
      : step === 3
        ? Boolean(profile.level)
        : step === 5
          ? profile.primaryGoal.trim().length > 0
          : true;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen flex-col bg-white text-slate-950"
      role="dialog"
      aria-modal
      aria-labelledby="study-onboarding-title"
    >
      <header className="shrink-0 border-b border-slate-100 px-4 pt-4 pb-3 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            aria-label={step === 0 ? "Close" : "Back"}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={step === 0 ? onClose : goBack}
          >
            {step === 0 ? <X size={20} /> : <ArrowLeft size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs font-semibold text-slate-400">
              Step {step + 1} of {STEP_COUNT}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
          >
            Skip
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
        {step === 0 && (
          <StepShell
            title="What exam are you preparing for?"
            subtitle="We'll tailor summaries, quizzes, and flashcards to your goal."
          >
            <input
              autoFocus
              className={inputClass}
              placeholder="e.g. USMLE Step 1, MCAT, Organic Chemistry Final"
              value={profile.examGoal}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  examGoal: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && canContinue) goNext();
              }}
            />
          </StepShell>
        )}

        {step === 1 && (
          <StepShell
            title="When is your exam?"
            subtitle="Optional — we'll help you pace your study schedule."
          >
            <input
              type="date"
              className={inputClass}
              value={profile.examDate}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  examDate: event.target.value,
                }))
              }
            />
          </StepShell>
        )}

        {step === 2 && (
          <StepShell
            title="How many hours can you study per week?"
            subtitle="Pick what feels realistic — you can change this later."
          >
            <div className="space-y-2">
              {HOURS_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  active={profile.hoursPerWeek === option.value}
                  label={option.label}
                  onClick={() =>
                    setProfile((current) => ({
                      ...current,
                      hoursPerWeek: option.value,
                    }))
                  }
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            title="What's your current level?"
            subtitle="This helps us calibrate question difficulty."
          >
            <div className="space-y-2">
              {LEVELS.map((level) => (
                <OptionButton
                  key={level.value}
                  active={profile.level === level.value}
                  hint={level.hint}
                  label={level.label}
                  onClick={() =>
                    setProfile((current) => ({
                      ...current,
                      level: level.value,
                    }))
                  }
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell
            title="What helps you learn most?"
            subtitle="Select all that apply — we'll prioritize these formats."
          >
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map((format) => {
                const active = profile.preferredFormats.includes(format);
                return (
                  <button
                    key={format}
                    type="button"
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    onClick={() => toggleFormat(format)}
                  >
                    {format}
                  </button>
                );
              })}
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell
            title="What's your primary goal?"
            subtitle="We'll focus your study plan around this outcome."
          >
            <div className="space-y-2">
              {GOAL_OPTIONS.map((goal) => (
                <OptionButton
                  key={goal}
                  active={profile.primaryGoal === goal}
                  label={goal}
                  onClick={() =>
                    setProfile((current) => ({ ...current, primaryGoal: goal }))
                  }
                />
              ))}
            </div>
          </StepShell>
        )}
      </main>

      <footer className="shrink-0 border-t border-slate-100 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl gap-3">
          {step > 0 && (
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={goBack}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="flex-1 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            disabled={!canContinue}
            onClick={goNext}
          >
            {isLastStep ? "Save study plan" : "Continue"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h1
        id="study-onboarding-title"
        className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl"
      >
        {title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-slate-500">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function OptionButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        active
          ? "border-blue-500 bg-blue-50/80 ring-2 ring-blue-500/15"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      onClick={onClick}
    >
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs font-medium text-slate-500">
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
          active ? "border-blue-600 bg-blue-600" : "border-slate-300"
        }`}
        aria-hidden
      >
        {active ? (
          <span className="block size-2 rounded-full bg-white" />
        ) : null}
      </span>
    </button>
  );
}
