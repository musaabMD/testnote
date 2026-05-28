"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, FileText, Loader2, X } from "lucide-react";
import { useExamCatalog } from "@/hooks/use-exam-catalog";
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
  onComplete?: (result: StudyOnboardingResult) => void;
  pendingFiles?: PendingOnboardingFile[];
};

export type StudyOnboardingResult = {
  profile: StudyProfile;
  examSlug?: string;
  examName?: string;
};

export type PendingOnboardingFile = {
  name: string;
  size?: number;
};

export function StudyOnboardingModal({
  open,
  onClose,
  onComplete,
  pendingFiles = [],
}: StudyOnboardingModalProps) {
  const { exams: examOptions, isLoading: examsLoading } = useExamCatalog();
  const [profile, setProfile] = useState<StudyProfile>(
    () => loadStudyProfile() ?? DEFAULT_STUDY_PROFILE,
  );
  const [selectedExamSlug, setSelectedExamSlug] = useState(
    () => loadStudyProfile()?.examSlug ?? "",
  );
  const [customExamOpen, setCustomExamOpen] = useState(() => {
    const saved = loadStudyProfile();
    return Boolean(saved?.examGoal?.trim() && !saved.examSlug);
  });
  const [step, setStep] = useState(0);

  const selectedExam = useMemo(
    () => examOptions?.find((exam) => exam.slug === selectedExamSlug) ?? null,
    [examOptions, selectedExamSlug],
  );

  if (!open) return null;

  function chooseExam(slug: string, name: string) {
    setSelectedExamSlug(slug);
    setCustomExamOpen(false);
    setProfile((current) => ({ ...current, examGoal: name }));
  }

  function chooseOther() {
    setSelectedExamSlug("");
    setCustomExamOpen(true);
    setProfile((current) => ({
      ...current,
      examGoal: current.examSlug ? "" : current.examGoal,
    }));
  }

  function toggleFormat(format: string) {
    setProfile((current) => ({
      ...current,
      preferredFormats: current.preferredFormats.includes(format)
        ? current.preferredFormats.filter((item) => item !== format)
        : [...current.preferredFormats, format],
    }));
  }

  function buildResult(): StudyOnboardingResult {
    const fallbackExamName = profile.examGoal.trim();
    const examName = selectedExam?.name ?? fallbackExamName;
    const finalProfile: StudyProfile = {
      ...profile,
      examGoal: examName,
      examSlug: selectedExam?.slug ?? "",
      examName,
    };
    return {
      profile: finalProfile,
      examSlug: selectedExam?.slug,
      examName: examName || undefined,
    };
  }

  function completeOnboarding() {
    const result = buildResult();
    saveStudyProfile(result.profile);
    onComplete?.(result);
    onClose();
  }

  function handleFinish() {
    completeOnboarding();
  }

  function handleSkip() {
    completeOnboarding();
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
      ? Boolean(selectedExam || (customExamOpen && profile.examGoal.trim()))
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
            className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
            onClick={handleSkip}
          >
            {pendingFiles.length ? "Skip and upload" : "Skip"}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
        {pendingFiles.length ? <PendingFiles files={pendingFiles} /> : null}

        {step === 0 && (
          <StepShell
            title="What exam or course are you preparing for?"
            subtitle="Pick a tag before upload. Free text stays hidden unless you choose Other."
          >
            {examsLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading exam catalog...
                </p>
              </div>
            ) : (
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {(examOptions ?? []).map((exam) => (
                  <OptionButton
                    key={exam.slug}
                    active={selectedExamSlug === exam.slug}
                    hint={`${exam.category} · ${exam.countryName}`}
                    label={exam.name}
                    onClick={() => chooseExam(exam.slug, exam.name)}
                  />
                ))}
                <OptionButton
                  active={customExamOpen}
                  hint="Only use this when your exam or course is not listed."
                  label="Other"
                  onClick={chooseOther}
                />
              </div>
            )}

            {customExamOpen ? (
              <input
                autoFocus
                className={`${inputClass} mt-4`}
                placeholder="Type your exam or course name"
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
            ) : null}

            <p className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
              Uploaded files keep this tag so they can be added to the matching
              exam page later, and you can upload more under the same tag.
            </p>
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

function PendingFiles({ files }: { files: PendingOnboardingFile[] }) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Upload ready
        </p>
        <p className="text-xs font-bold text-blue-700">
          {files.length} file{files.length === 1 ? "" : "s"} queued
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full w-1/3 rounded-full bg-blue-600" />
      </div>
      <div className="mt-3 space-y-2">
        {files.slice(0, 3).map((file) => (
          <div
            key={`${file.name}-${file.size ?? "unknown"}`}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700"
          >
            <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-slate-400">Waiting</span>
          </div>
        ))}
        {files.length > 3 ? (
          <p className="text-xs font-semibold text-slate-400">
            +{files.length - 3} more queued
          </p>
        ) : null}
      </div>
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
