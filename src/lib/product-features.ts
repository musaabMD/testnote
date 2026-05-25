import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookMarked,
  CheckSquare,
  Clock,
  FileStack,
  History,
  Layers,
  Library,
} from "lucide-react";

export type ProductFeature = {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
};

export const PRODUCT_FEATURES: ProductFeature[] = [
  {
    title: "File to questions",
    description:
      "Upload PDFs, images, or pasted text and get clean, reviewable questions automatically.",
    icon: FileStack,
    color: "bg-sky-100 text-sky-700",
  },
  {
    title: "Quiz mode",
    description:
      "Practice with instant feedback after each answer. Pause anytime and resume where you left off.",
    icon: CheckSquare,
    color: "bg-violet-100 text-violet-700",
  },
  {
    title: "Exam mode",
    description:
      "Timed simulations with no hints until the end — mirrors real exam conditions.",
    icon: Clock,
    color: "bg-amber-100 text-amber-700",
  },
  {
    title: "Review",
    description:
      "Browse every extracted question, filter by status, and drill into detailed explanations.",
    icon: BookMarked,
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    title: "Flashcards",
    description:
      "One concept per card. Reveal answers and cycle through until you've mastered the set.",
    icon: Layers,
    color: "bg-cyan-100 text-cyan-700",
  },
  {
    title: "Library",
    description:
      "Organize files and sources in one place — browse, bookmark, and jump back in fast.",
    icon: Library,
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    title: "Analysis",
    description:
      "Review completed quiz and exam sessions to see scores and missed questions.",
    icon: BarChart3,
    color: "bg-blue-100 text-blue-700",
  },
  {
    title: "Sessions",
    description:
      "Every quiz and exam run is saved so you can track progress over time.",
    icon: History,
    color: "bg-teal-100 text-teal-700",
  },
];

export const FEATURE_CARD_CLASS =
  "rounded-3xl border border-[#d1d1d1] bg-[#fafafa] p-6 transition hover:border-[#bdbdbd] hover:bg-[#f5f5f5]";
