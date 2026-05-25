"use client";

import { Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  QBankUpload,
  type QBankUploadSnapshot,
} from "@/components/qbank-upload";
import { StudyOnboardingModal } from "@/components/study-onboarding-modal";
import {
  isStudyProfileComplete,
  loadStudyProfile,
} from "@/lib/study-profile";

type AddPageProps = {
  /** @deprecated Sources are saved via real extraction; callback is ignored. */
  onAddSource?: (source: unknown) => void;
  onDone?: () => void;
};

export function AddPage({ onDone }: AddPageProps) {
  const router = useRouter();
  const [upload, setUpload] = useState<QBankUploadSnapshot | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [profileComplete, setProfileComplete] = useState(() =>
    isStudyProfileComplete(loadStudyProfile()),
  );

  const handleUploadChange = useCallback((snapshot: QBankUploadSnapshot) => {
    setUpload(snapshot);
  }, []);

  const canContinue =
    upload &&
    upload.totalItems > 0 &&
    upload.allFilesReady &&
    !upload.hasErrors;

  function finish() {
    if (!canContinue) return;
    if (onDone) {
      onDone();
      return;
    }
    router.push("/dashboard");
  }

  function handleOnboardingClose() {
    setOnboardingOpen(false);
    setProfileComplete(isStudyProfileComplete(loadStudyProfile()));
  }

  if (onboardingOpen) {
    return <StudyOnboardingModal open onClose={handleOnboardingClose} />;
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Add sources
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Upload PDFs or paste notes — questions are extracted automatically.
          </p>
        </div>

        <QBankUpload
          variant="dashboard"
          showContinueLink={false}
          onChange={handleUploadChange}
        />

        <button
          type="button"
          onClick={() => setOnboardingOpen(true)}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-blue-200 bg-blue-50 px-5 py-4 text-base font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
        >
          <Settings2 className="size-5 shrink-0" aria-hidden />
          {profileComplete ? "Edit study plan" : "Customize study plan"}
        </button>

        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-4 text-base font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          disabled={!canContinue}
          onClick={finish}
        >
          {upload?.totalItems && upload.allFilesReady
            ? `Continue with ${upload.totalItems} source${upload.totalItems > 1 ? "s" : ""}`
            : upload?.isProcessing
              ? "Extracting questions…"
              : "Upload a file to continue"}
        </button>
      </main>
    </>
  );
}
