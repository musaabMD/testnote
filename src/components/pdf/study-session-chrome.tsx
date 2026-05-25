"use client";

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const LOGO_URL =
  "https://q648y7e0kt.ufs.sh/f/7bppoSdGjTuBsGmvNyR3mYU4jKNLJh5ZQuVOqsSP06Elv89c";

type StudySessionChromeState = {
  center: ReactNode;
  right: ReactNode;
  variant: "default" | "minimal" | "hidden";
};

type StudySessionChromeContextValue = {
  setChrome: (next: Partial<StudySessionChromeState>) => void;
  resetChrome: () => void;
};

const defaultChrome: StudySessionChromeState = {
  center: null,
  right: null,
  variant: "default",
};

const StudySessionChromeContext =
  createContext<StudySessionChromeContextValue | null>(null);

export function StudySessionChromeProvider({
  children,
  onBack,
  title,
}: {
  children: ReactNode;
  onBack: () => void;
  title?: string;
}) {
  const [chrome, setChromeState] = useState<StudySessionChromeState>(defaultChrome);

  const value = useMemo(
    () => ({
      setChrome: (next: Partial<StudySessionChromeState>) => {
        setChromeState((current) => ({ ...current, ...next }));
      },
      resetChrome: () => setChromeState(defaultChrome),
    }),
    [],
  );

  if (chrome.variant === "hidden") {
    return (
      <StudySessionChromeContext.Provider value={value}>
        {children}
      </StudySessionChromeContext.Provider>
    );
  }

  const isMinimal = chrome.variant === "minimal";

  return (
    <StudySessionChromeContext.Provider value={value}>
      <header
        className={`sticky top-0 z-50 shrink-0 border-b bg-white ${
          isMinimal ? "border-transparent" : "border-slate-100"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4">
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            {chrome.center ?? (
              <>
                <Image
                  alt="DrNote"
                  className="size-7 rounded-lg object-contain"
                  height={28}
                  src={LOGO_URL}
                  unoptimized
                  width={28}
                />
                <span className="truncate font-[family-name:var(--font-sora)] text-sm font-black text-slate-950 sm:text-base">
                  {title ?? "DrNote"}
                </span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {chrome.right}
          </div>
        </div>
      </header>
      {children}
    </StudySessionChromeContext.Provider>
  );
}

export function useStudySessionChrome() {
  const context = useContext(StudySessionChromeContext);
  if (!context) {
    throw new Error("useStudySessionChrome must be used within StudySessionChromeProvider");
  }
  return context;
}

export function useStudySessionChromeOptional() {
  return useContext(StudySessionChromeContext);
}
