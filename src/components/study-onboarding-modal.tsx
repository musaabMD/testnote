"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, Loader2, Sparkles, X } from "lucide-react";
import { useExamCatalog } from "@/hooks/use-exam-catalog";
import {
  getOnboardingExamOptions,
  normalizeOnboardingExamSuggestions,
  rankOnboardingExamOptions,
  type OnboardingExamSuggestion,
} from "@/lib/onboarding-exams";
import {
  DEFAULT_STUDY_PROFILE,
  loadStudyProfile,
  saveStudyProfile,
  type StudyProfile,
} from "@/lib/study-profile";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

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
  type?: string;
  file?: File;
};

type SuggestionState =
  | { status: "idle"; suggestions: OnboardingExamSuggestion[] }
  | { status: "loading"; suggestions: OnboardingExamSuggestion[] }
  | { status: "ready"; suggestions: OnboardingExamSuggestion[] };

export function StudyOnboardingModal({
  open,
  onClose,
  onComplete,
  pendingFiles = [],
}: StudyOnboardingModalProps) {
  const { exams: examCatalog, isLoading: examsLoading } = useExamCatalog();
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
  const [suggestionState, setSuggestionState] = useState<SuggestionState>({
    status: "idle",
    suggestions: [],
  });

  const examOptions = useMemo(
    () => getOnboardingExamOptions(examCatalog),
    [examCatalog],
  );
  const effectiveSuggestions = useMemo(
    () => (pendingFiles.length > 0 ? suggestionState.suggestions : []),
    [pendingFiles.length, suggestionState.suggestions],
  );
  const suggestionsBySlug = useMemo(
    () => new Map(effectiveSuggestions.map((item) => [item.slug, item])),
    [effectiveSuggestions],
  );
  const rankedExamOptions = useMemo(
    () => rankOnboardingExamOptions(examOptions, effectiveSuggestions),
    [examOptions, effectiveSuggestions],
  );
  const selectedExam = useMemo(
    () => examOptions.find((exam) => exam.slug === selectedExamSlug) ?? null,
    [examOptions, selectedExamSlug],
  );
  const suggestionRequestKey = useMemo(
    () =>
      pendingFiles
        .map((file) => `${file.name}:${file.size ?? 0}:${file.type ?? ""}`)
        .join("|"),
    [pendingFiles],
  );

  useEffect(() => {
    if (!open || pendingFiles.length === 0) {
      return;
    }

    const controller = new AbortController();
    const formData = new FormData();
    for (const pendingFile of pendingFiles.slice(0, 3)) {
      formData.append("fileNames", pendingFile.name);
      if (pendingFile.file) {
        formData.append("files", pendingFile.file, pendingFile.file.name);
      }
    }

    formData.append("locale", navigator.language);
    formData.append(
      "timeZone",
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    );
    formData.append(
      "countryName",
      Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Riyadh"
        ? "Saudi Arabia"
        : "",
    );

    const run = async () => {
      setSuggestionState({ status: "loading", suggestions: [] });
      try {
        const response = await fetch("/api/onboarding/exam-suggestions", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const payload = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        setSuggestionState({
          status: "ready",
          suggestions: normalizeOnboardingExamSuggestions(payload),
        });
      } catch {
        if (!controller.signal.aborted) {
          setSuggestionState({ status: "ready", suggestions: [] });
        }
      }
    };

    void run();

    return () => controller.abort();
  }, [open, pendingFiles, suggestionRequestKey]);

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

  function skipOnboarding() {
    const finalProfile: StudyProfile = {
      ...profile,
      examGoal: "",
      examSlug: "",
      examName: "",
    };
    saveStudyProfile(finalProfile);
    onComplete?.({ profile: finalProfile });
    onClose();
  }

  const canContinue = Boolean(selectedExam || (customExamOpen && profile.examGoal.trim()));

  return (
    <div
      className="fixed inset-0 z-[100] bg-white text-slate-950"
      role="dialog"
      aria-modal
      aria-labelledby="study-onboarding-title"
    >
      <div className="flex h-screen min-h-screen flex-col overflow-hidden">
        <header className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-500">Exam tag</p>
              {pendingFiles.length ? (
                <p className="mt-0.5 text-xs font-medium text-slate-400">
                  {pendingFiles.length} upload{pendingFiles.length === 1 ? "" : "s"} waiting
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close onboarding"
              className="grid size-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
          {pendingFiles.length ? <PendingFiles files={pendingFiles} /> : null}

          <h1
            id="study-onboarding-title"
            className="text-2xl font-black tracking-tight text-slate-950 sm:text-[28px]"
          >
            What exam or course are you preparing for?
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Pick one tag before upload. Choose Other only when your exam or course is not listed.
          </p>

          <SuggestionStatus
            hasFiles={pendingFiles.length > 0}
            hasSuggestions={suggestionState.suggestions.length > 0}
            status={suggestionState.status}
          />

          {examsLoading ? (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading exam catalog...
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2 pr-1 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0">
              {rankedExamOptions.map((exam) => {
                const suggestion = suggestionsBySlug.get(exam.slug);
                return (
                  <OptionButton
                    key={exam.slug}
                    active={selectedExamSlug === exam.slug}
                    badge={suggestion ? "Suggested" : undefined}
                    hint={suggestion?.reason ?? `${exam.category} · ${exam.countryName}`}
                    label={exam.name}
                    meta={`${exam.category} · ${exam.countryName}`}
                    onClick={() => chooseExam(exam.slug, exam.name)}
                  />
                );
              })}
              <OptionButton
                active={customExamOpen}
                className="sm:col-span-2"
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
                if (event.key === "Enter" && canContinue) completeOnboarding();
              }}
            />
          ) : null}

          <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            Uploaded files keep this tag so they can be added to the matching exam page later,
            and you can upload more under the same tag.
          </p>
        </main>

        <footer className="shrink-0 border-t border-slate-100 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-2xl gap-3">
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              onClick={skipOnboarding}
            >
              {pendingFiles.length ? "Upload without tag" : "Skip"}
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              disabled={!canContinue}
              onClick={completeOnboarding}
            >
              {pendingFiles.length ? "Continue upload" : "Save tag"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SuggestionStatus({
  status,
  hasFiles,
  hasSuggestions,
}: {
  status: SuggestionState["status"];
  hasFiles: boolean;
  hasSuggestions: boolean;
}) {
  if (!hasFiles) return null;
  if (status === "loading") {
    return (
      <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking your upload for likely exam tags...
      </p>
    );
  }
  if (status === "ready" && hasSuggestions) {
    return (
      <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
        <Sparkles className="size-4" aria-hidden />
        Suggested tags are moved to the top.
      </p>
    );
  }
  if (status === "ready") {
    return (
      <p className="mt-5 text-sm font-semibold text-slate-500">
        Choose the matching tag below.
      </p>
    );
  }
  return null;
}

function PendingFiles({ files }: { files: PendingOnboardingFile[] }) {
  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase text-slate-400">Upload ready</p>
      <div className="mt-3 space-y-2">
        {files.slice(0, 3).map((file) => (
          <FileRow key={`${file.name}-${file.size ?? "unknown"}`}>
            <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-slate-400">Waiting</span>
          </FileRow>
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

function FileRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      {children}
    </div>
  );
}

function OptionButton({
  label,
  meta,
  hint,
  badge,
  className = "",
  active,
  onClick,
}: {
  label: string;
  meta?: string;
  hint?: string;
  badge?: string;
  className?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition ${className} ${
        active
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-900">{label}</span>
          {badge ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
              {badge}
            </span>
          ) : null}
        </span>
        {meta ? (
          <span className="mt-0.5 block text-xs font-semibold text-slate-500">
            {meta}
          </span>
        ) : null}
        {hint && hint !== meta ? (
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
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
        {active ? <span className="block size-2 rounded-full bg-white" /> : null}
      </span>
    </button>
  );
}
