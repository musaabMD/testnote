"use client";

import { useEffect, useState } from "react";

const WORDS = ["flashcards", "QBank", "exams"] as const;
const LONGEST_WORD = "flashcards";
const INTERVAL_MS = 2800;

export function RotatingHeadline() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        setVisible(true);
      }, 280);
    }, INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  const word = WORDS[index];

  return (
    <h1 className="mt-6 max-w-[900px] font-[family-name:var(--font-sora)] text-[1.75rem] font-extrabold leading-[1.08] tracking-tight text-slate-950 sm:mt-8 sm:text-4xl lg:text-5xl xl:text-[3.25rem]">
      Turn your files into{" "}
      <span
        className="relative inline-grid align-bottom text-left"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="invisible col-start-1 row-start-1" aria-hidden="true">
          {LONGEST_WORD}
        </span>
        <span
          className="col-start-1 row-start-1 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent transition-all duration-300 ease-out"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(0.35em)",
          }}
        >
          {word}
        </span>
      </span>
    </h1>
  );
}
