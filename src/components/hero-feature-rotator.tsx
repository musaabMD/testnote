"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookMarked,
  CheckSquare,
  Clock,
  Files,
  History,
  Layers,
  Library,
  PieChart,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";

const ROTATING_FEATURES: Array<{
  label: string;
  icon: LucideIcon;
  colorClass: string;
}> = [
  { label: "quiz mode", icon: CheckSquare, colorClass: "text-indigo-600" },
  { label: "timed quiz", icon: Timer, colorClass: "text-orange-600" },
  { label: "exam mode", icon: Clock, colorClass: "text-amber-600" },
  { label: "analytics", icon: PieChart, colorClass: "text-fuchsia-600" },
  { label: "question review", icon: BookMarked, colorClass: "text-lime-600" },
  { label: "full analysis", icon: BarChart3, colorClass: "text-cyan-600" },
  { label: "session history", icon: History, colorClass: "text-violet-600" },
  { label: "more files", icon: Files, colorClass: "text-rose-600" },
  { label: "review mode", icon: BookMarked, colorClass: "text-green-600" },
  { label: "flashcards", icon: Layers, colorClass: "text-purple-600" },
  { label: "library", icon: Library, colorClass: "text-blue-600" },
];

const INTERVAL_MS = 2600;

export function HeroRotatingLine() {
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
        setIndex((current) => (current + 1) % ROTATING_FEATURES.length);
        setVisible(true);
      }, 280);
    }, INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  const feature = ROTATING_FEATURES[index]!;
  const FeatureIcon = feature.icon;
  const motionStyle = {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(0.35em)",
    transition: "opacity 300ms ease-out, transform 300ms ease-out",
  };

  return (
    <span
      className={`inline-flex max-w-full items-center justify-center gap-2 overflow-hidden capitalize ${feature.colorClass}`}
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Get ${feature.label}`}
      style={motionStyle}
    >
      {feature.label}
      <FeatureIcon
        aria-hidden
        className="size-[0.85em] shrink-0"
        strokeWidth={2.25}
      />
    </span>
  );
}
