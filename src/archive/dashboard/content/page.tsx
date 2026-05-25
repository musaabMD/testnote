"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  BookMarked,
  CheckSquare,
  Clock,
  Download,
  FileText,
  Flame,
  History,
  Layers,
  Library,
  Link2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { AddSourceCard } from "@/components/dashboard/add-source-card";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { FileList } from "@/components/pdf/file-list";
import { StudyModePicker } from "@/components/pdf/pdf-study-panel";
import type { PdfFileQueueItem } from "@/lib/pdf-mcqs";
import { filterSupportedUploadFiles, processPdfUploads } from "@/lib/process-pdf-upload";
import { loadFiles, resolveQueueFileId } from "@/lib/pdf-view-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddPage } from "@/components/add-page";

type SourceType = "pdf" | "text" | "link" | "video";
type ColorKey = "indigo" | "violet" | "sky" | "emerald" | "rose" | "amber";
type Page =
  | "library"
  | "add"
  | "detail"
  | "study"
  | "exam"
  | "flashcards"
  | "summary"
  | "pdfview"
  | "review"
  | "review_detail";

type Source = {
  id: string;
  type: SourceType;
  title: string;
  subject: string;
  color: ColorKey;
  preview: string;
  cards: number;
  progress: number;
  createdAt: string;
  url?: string;
  parentId?: string;
  fileName?: string;
  queueFileId?: string;
};

type AddedItem = {
  id: string;
  kind: "file" | "link" | "text";
  label: string;
};

type QuizSettings = {
  showAnswers: "asIGo" | "atEnd";
  submitMode: "manual" | "auto";
  subjects: string[];
  includeNew: boolean;
  includeAnswered: boolean;
  includeFlagged: boolean;
  includeIncorrect: boolean;
  questionCount: number;
};

const subjectsList = [
  "Chemistry",
  "Stereochemistry",
  "Mechanisms",
  "Addition reactions",
  "Organic structures",
];

const colors: Record<
  ColorKey,
  { bg: string; text: string; accent: string; border: string; ring: string }
> = {
  indigo: {
    bg: "bg-indigo-50",
    text: "text-indigo-800",
    accent: "bg-indigo-500",
    border: "border-indigo-200",
    ring: "ring-indigo-500/20",
  },
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-800",
    accent: "bg-violet-500",
    border: "border-violet-200",
    ring: "ring-violet-500/20",
  },
  sky: {
    bg: "bg-sky-50",
    text: "text-sky-800",
    accent: "bg-sky-500",
    border: "border-sky-200",
    ring: "ring-sky-500/20",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    accent: "bg-emerald-500",
    border: "border-emerald-200",
    ring: "ring-emerald-500/20",
  },
  rose: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    accent: "bg-rose-500",
    border: "border-rose-200",
    ring: "ring-rose-500/20",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    accent: "bg-amber-500",
    border: "border-amber-200",
    ring: "ring-amber-500/20",
  },
};

const colorKeys = Object.keys(colors) as ColorKey[];

const cardThemes: Record<ColorKey, { from: string; cardBg: string }> = {
  indigo: {
    from: "#6366F1",
    cardBg: "linear-gradient(145deg, #4F46E5 0%, #818CF8 100%)",
  },
  sky: {
    from: "#0891B2",
    cardBg: "linear-gradient(145deg, #0369A1 0%, #22D3EE 100%)",
  },
  emerald: {
    from: "#059669",
    cardBg: "linear-gradient(145deg, #047857 0%, #34D399 100%)",
  },
  rose: {
    from: "#E11D48",
    cardBg: "linear-gradient(145deg, #BE123C 0%, #FB7185 100%)",
  },
  amber: {
    from: "#D97706",
    cardBg: "linear-gradient(145deg, #B45309 0%, #FCD34D 100%)",
  },
  violet: {
    from: "#7C3AED",
    cardBg: "linear-gradient(145deg, #6D28D9 0%, #C084FC 100%)",
  },
};

function sourceStreak(source: Source) {
  if (source.progress <= 0) return 0;
  return Math.min(9, Math.max(1, Math.round(source.cards / 5)));
}

const typeMeta: Record<SourceType, { label: string; icon: string }> = {
  pdf: {
    label: "PDF",
    icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 0v6h6M8 13h8M8 17h5",
  },
  text: { label: "Note", icon: "M4 6h16M4 10h16M4 14h10" },
  link: {
    label: "Link",
    icon: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  },
  video: {
    label: "Video",
    icon: "M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z",
  },
};

const REFERRAL_COUNT = 3;
const STREAK_COUNT = 3;
const CURRENT_USER = { name: "Mousab", initial: "M" };

const gameifiedCounterBtn =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-2xl border-2 border-b-[5px] px-3 text-lg font-extrabold tabular-nums transition active:translate-y-px active:border-b-2 active:shadow-none";
const gameifiedActionBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border-2 border-b-[5px] px-3 text-sm font-extrabold transition active:translate-y-px active:border-b-2 active:shadow-none sm:px-4";
const REFERRAL_LINK = "https://drnote.co/?ref=you";
const REFERRALS = [
  { name: "Alex M.", joined: "2 days ago" },
  { name: "Sam K.", joined: "1 week ago" },
  { name: "Jordan P.", joined: "2 weeks ago" },
] as const;

const seedSources: Source[] = [
  {
    id: "1",
    type: "pdf",
    title: "Organic Chemistry",
    subject: "Chemistry",
    color: "indigo",
    preview:
      "Nucleophilic substitution, epoxides, stereochemistry and reaction mechanisms.",
    cards: 24,
    progress: 68,
    createdAt: "May 10",
    fileName: "organic-chemistry.pdf",
  },
  {
    id: "2",
    type: "pdf",
    title: "Microeconomics",
    subject: "Economics",
    color: "amber",
    preview:
      "Supply and demand curves, market equilibrium, elasticity concepts.",
    cards: 18,
    progress: 32,
    createdAt: "May 8",
    fileName: "microeconomics.pdf",
  },
  {
    id: "3",
    type: "pdf",
    title: "Linear Algebra",
    subject: "Math",
    color: "violet",
    preview:
      "Vectors, matrices, linear transformations, eigenvalues and eigenvectors.",
    cards: 31,
    progress: 85,
    createdAt: "May 5",
    fileName: "linear-algebra.pdf",
  },
  {
    id: "4",
    type: "text",
    title: "Cell Biology Notes",
    subject: "Biology",
    color: "emerald",
    preview:
      "Mitosis vs meiosis, protein synthesis, membrane transport mechanisms.",
    cards: 14,
    progress: 12,
    createdAt: "May 3",
  },
  {
    id: "5",
    type: "link",
    title: "Khan Academy: Thermo",
    subject: "Physics",
    color: "rose",
    preview:
      "Video series on entropy, Gibbs free energy and reaction spontaneity.",
    cards: 9,
    progress: 55,
    createdAt: "Apr 30",
    url: "https://khanacademy.org",
  },
  {
    id: "6",
    type: "video",
    title: "MIT OCW - Calculus",
    subject: "Math",
    color: "sky",
    preview:
      "Lecture 12: Integration by parts and trigonometric substitution.",
    cards: 7,
    progress: 0,
    createdAt: "Apr 28",
    url: "https://ocw.mit.edu",
  },
];

const seedFolderSources: Source[] = [
  {
    id: "1-a",
    parentId: "1",
    type: "pdf",
    title: "Chapter 1 — Alkanes",
    subject: "Chemistry",
    color: "indigo",
    preview: "Nomenclature, conformations, and radical halogenation.",
    cards: 8,
    progress: 40,
    createdAt: "May 11",
    fileName: "chapter-1-alkanes.pdf",
  },
  {
    id: "1-b",
    parentId: "1",
    type: "pdf",
    title: "Stereochemistry Worksheet",
    subject: "Chemistry",
    color: "violet",
    preview: "R/S configuration, enantiomers, and diastereomers.",
    cards: 6,
    progress: 72,
    createdAt: "May 11",
    fileName: "stereochemistry-worksheet.pdf",
  },
  {
    id: "1-c",
    parentId: "1",
    type: "text",
    title: "Reaction Mechanisms Notes",
    subject: "Chemistry",
    color: "sky",
    preview: "SN1, SN2, E1, E2 pathways and stereochemical outcomes.",
    cards: 10,
    progress: 55,
    createdAt: "May 10",
  },
  {
    id: "2-a",
    parentId: "2",
    type: "pdf",
    title: "Supply & Demand",
    subject: "Economics",
    color: "amber",
    preview: "Shifts in supply and demand, consumer surplus.",
    cards: 5,
    progress: 20,
    createdAt: "May 9",
  },
  {
    id: "2-b",
    parentId: "2",
    type: "link",
    title: "Elasticity Explainer",
    subject: "Economics",
    color: "rose",
    preview: "Price elasticity of demand and cross-price elasticity.",
    cards: 4,
    progress: 45,
    createdAt: "May 8",
  },
  {
    id: "3-a",
    parentId: "3",
    type: "pdf",
    title: "Matrix Operations",
    subject: "Math",
    color: "violet",
    preview: "Row reduction, inverses, and determinants.",
    cards: 12,
    progress: 90,
    createdAt: "May 6",
  },
];

function truncateSourceTitle(title: string, maxLength = 20) {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1)}…`;
}

function sourcePickerCountLabel(selectedIds: string[]) {
  const count = selectedIds.length;
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function sourcePickerAllSelected(
  selectedIds: string[],
  folderSources: Source[],
) {
  return (
    folderSources.length > 0 &&
    selectedIds.length === folderSources.length
  );
}

/* ── Study dashboard types ── */
type SubjectDef = {
  id: number;
  name: string;
  questions: number;
  done: number;
  total: number;
  accent: string;
  light: string;
  lighter: string;
  iconColor: string;
  icon: string;
  inProgress: boolean;
};

type ModeStat = { label: string; value: string | number };

type ModeDef = {
  key: string;
  label: string;
  icon: string;
  color: string;
  light: string;
  lighter: string;
  dark: string;
  description: string;
  detail: string;
  stats: (s: SubjectDef) => ModeStat[];
  ctaLabel: (s: SubjectDef) => string;
  resumable: boolean;
};

const STUDY_SUBJECTS: SubjectDef[] = [
  { id: 1, name: "Chemistry",          questions: 24, done: 8,  total: 12, accent: "#F59E0B", light: "#FFFBEB", lighter: "#FEF3C7", iconColor: "#92400E", icon: "flask",          inProgress: true  },
  { id: 2, name: "Stereochemistry",    questions: 36, done: 11, total: 18, accent: "#3B82F6", light: "#EFF6FF", lighter: "#DBEAFE", iconColor: "#1E3A8A", icon: "atom",           inProgress: true  },
  { id: 3, name: "Mechanisms",         questions: 32, done: 9,  total: 16, accent: "#10B981", light: "#ECFDF5", lighter: "#D1FAE5", iconColor: "#064E3B", icon: "arrows-shuffle", inProgress: true  },
  { id: 4, name: "Addition reactions", questions: 20, done: 0,  total: 14, accent: "#EF4444", light: "#FEF2F2", lighter: "#FEE2E2", iconColor: "#7F1D1D", icon: "plus",           inProgress: false },
  { id: 5, name: "Organic structures", questions: 12, done: 0,  total: 10, accent: "#8B5CF6", light: "#F5F3FF", lighter: "#EDE9FE", iconColor: "#3B0764", icon: "hexagon",        inProgress: false },
];

const STUDY_MODES: ModeDef[] = [
  {
    key: "summary", label: "Summary", icon: "book-2",
    color: "#0EA5E9", light: "#F0F9FF", lighter: "#E0F2FE", dark: "#0C4A6E",
    description: "A structured overview of every key concept, formula, and principle in this topic.",
    detail: "Best for a quick refresh before a study session or to fill in gaps in your notes.",
    stats: () => [
      { label: "Read time", value: "~5 min" },
      { label: "Sections",  value: "12" },
      { label: "Last read", value: "Never" },
    ],
    ctaLabel: () => "Read summary",
    resumable: false,
  },
  {
    key: "flashcards", label: "Flashcards", icon: "cards",
    color: "#8B5CF6", light: "#F5F3FF", lighter: "#EDE9FE", dark: "#3B0764",
    description: "One concept per card. Swipe to reveal the answer and mark what you know.",
    detail: "Spaced repetition keeps hard cards coming back until you've mastered them.",
    stats: (s) => [
      { label: "Total cards", value: s.questions * 2 },
      { label: "Mastered",    value: s.inProgress ? Math.round(s.done / s.total * s.questions * 2) : 0 },
      { label: "Remaining",   value: s.inProgress ? s.questions * 2 - Math.round(s.done / s.total * s.questions * 2) : s.questions * 2 },
    ],
    ctaLabel: () => "Start flashcards",
    resumable: false,
  },
  {
    key: "quiz", label: "Quiz", icon: "help-circle",
    color: "#F59E0B", light: "#FFFBEB", lighter: "#FEF3C7", dark: "#78350F",
    description: "Practice questions with instant right/wrong feedback after each answer.",
    detail: "You can pause anytime and pick up exactly where you left off.",
    stats: (s) => [
      { label: "Questions", value: s.total },
      { label: "Answered",  value: s.done },
      { label: "Remaining", value: s.total - s.done },
    ],
    ctaLabel: (s) => s.inProgress ? "Resume quiz" : "Start quiz",
    resumable: true,
  },
  {
    key: "exam", label: "Exam", icon: "clipboard-list",
    color: "#EF4444", light: "#FEF2F2", lighter: "#FEE2E2", dark: "#7F1D1D",
    description: "A full timed simulation with no hints and no feedback until the very end.",
    detail: "Mirrors real exam conditions. Results and analysis shown only after completion.",
    stats: (s) => [
      { label: "Duration",  value: "45 min" },
      { label: "Questions", value: s.questions },
      { label: "Attempts",  value: s.inProgress ? "1 left" : "2 left" },
    ],
    ctaLabel: (s) => s.inProgress ? "Resume exam" : "Start exam",
    resumable: true,
  },
];

/* ── Study dashboard sub-components ── */
function TablerIcon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  return (
    <i
      className={`ti ti-${name}`}
      aria-hidden="true"
      style={{ fontSize: size, ...(color ? { color } : {}) }}
    />
  );
}

function ProgressRing({ pct, color, light, size = 52, stroke = 5 }: { pct: number; color: string; light: string; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={light} strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .6s ease" }}
      />
    </svg>
  );
}

function StudyModePopup({ subject, mode, onClose }: { subject: SubjectDef; mode: ModeDef; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 260);
  };

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = subject.total > 0 ? Math.round(subject.done / subject.total * 100) : 0;
  const stats = mode.stats(subject);
  const ctaLabel = mode.ctaLabel(subject);
  const showRestart = mode.resumable && subject.inProgress;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 16px",
        background: visible ? "rgba(2,6,23,0.55)" : "rgba(2,6,23,0)",
        transition: "background .26s ease",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 420,
        background: "#fff", borderRadius: 28, overflow: "hidden",
        transform: visible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)",
        opacity: visible ? 1 : 0,
        transition: "transform .28s cubic-bezier(.22,1,.36,1), opacity .22s ease",
        fontFamily: "var(--font-sora), sans-serif",
      }}>
        {/* Header */}
        <div style={{ background: mode.light, padding: "28px 26px 24px", position: "relative" }}>
          <button
            onClick={handleClose}
            style={{
              position: "absolute", top: 20, right: 20,
              width: 32, height: 32, borderRadius: 99,
              border: "none", background: "rgba(0,0,0,0.07)",
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", color: "#64748b",
            }}
          >
            <TablerIcon name="x" size={16} />
          </button>
          <div style={{
            width: 56, height: 56, borderRadius: 18,
            background: mode.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 18,
            boxShadow: `0 8px 24px ${mode.color}44`,
          }}>
            <TablerIcon name={mode.icon} size={26} color="#fff" />
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 700, color: mode.dark,
            textTransform: "uppercase", letterSpacing: ".07em",
            marginBottom: 6, opacity: 0.7,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: subject.light,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <TablerIcon name={subject.icon} size={11} color={subject.iconColor} />
            </div>
            {subject.name}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginBottom: 8, lineHeight: 1.1 }}>
            {mode.label}
          </div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.65, fontFamily: "var(--font-dm-sans), sans-serif" }}>
            {mode.description}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginTop: 6, fontFamily: "var(--font-dm-sans), sans-serif" }}>
            {mode.detail}
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid #f1f5f9" }}>
          {stats.map((stat, i) => (
            <div key={i} style={{
              padding: "14px 0", textAlign: "center",
              borderRight: i < stats.length - 1 ? "1px solid #f1f5f9" : "none",
            }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: mode.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "var(--font-dm-sans), sans-serif" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Progress (resumable only) */}
        {mode.resumable && subject.inProgress && (
          <div style={{ padding: "16px 26px 0" }}>
            <div style={{
              background: mode.lighter, borderRadius: 14,
              padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <ProgressRing pct={pct} color={mode.color} light={mode.light} size={48} stroke={5} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
                  {pct}% complete
                </div>
                <div style={{ height: 5, background: "#fff", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: mode.color, borderRadius: 99, transition: "width .6s ease" }} />
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontFamily: "var(--font-dm-sans), sans-serif" }}>
                  {subject.done} of {subject.total} questions answered
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: "20px 26px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button style={{
            width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
            background: mode.color, color: "#fff",
            fontSize: 15, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "var(--font-sora), sans-serif",
            boxShadow: `0 4px 14px ${mode.color}40`,
          }}>
            <TablerIcon name={mode.resumable && subject.inProgress ? "player-play" : "arrow-right"} size={17} />
            {ctaLabel}
          </button>
          {showRestart && (
            <button
              onClick={handleClose}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 14,
                border: "1.5px solid #e2e8f0", background: "transparent",
                color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                fontFamily: "var(--font-sora), sans-serif",
              }}
            >
              <TablerIcon name="refresh" size={14} />
              Restart from beginning
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StudySubjectCard({ subject, onModeClick, index }: { subject: SubjectDef; onModeClick: (s: SubjectDef, m: ModeDef) => void; index: number }) {
  const pct = subject.total > 0 ? Math.round(subject.done / subject.total * 100) : 0;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: "#fff",
        border: hovered ? "1.5px solid #cbd5e1" : "1.5px solid #e2e8f0",
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 6,
        transition: "border-color .2s, box-shadow .2s",
        boxShadow: hovered ? "0 2px 8px rgba(0,0,0,0.05)" : "none",
        animation: `fadeSlideIn .35s ease both`,
        animationDelay: `${index * 0.04}s`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <TablerIcon name={subject.icon} size={14} color="#64748b" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "var(--font-sora), sans-serif" }}>
            {subject.name}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
            {subject.questions} questions
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {STUDY_MODES.map(m => (
            <button
              key={m.key}
              onClick={() => onModeClick(subject, m)}
              title={m.label}
              style={{
                width: 26, height: 26, borderRadius: 7,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              <TablerIcon name={m.icon} size={12} color="#94a3b8" />
            </button>
          ))}
          <button
            onClick={() => onModeClick(subject, STUDY_MODES.find(m => m.key === "quiz")!)}
            title={subject.inProgress ? "Resume quiz" : "Start quiz"}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              minWidth: 48, height: 26, padding: "0 9px",
              borderRadius: 99, border: "1px solid #c7d2fe",
              background: subject.inProgress ? "#eef2ff" : "#f8fafc",
              color: subject.inProgress ? "#4f46e5" : "#64748b",
              fontSize: 11, fontWeight: 800, cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <TablerIcon name={subject.inProgress ? "player-play" : "bolt"} size={11} />
            {pct}%
          </button>
        </div>
      </div>
    </div>
  );
}

function StudyModeButton({ mode, onClick }: { mode: ModeDef; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: 5,
        padding: "10px 4px", borderRadius: 10,
        border: hovered ? "1.5px solid #cbd5e1" : "1.5px solid #e2e8f0",
        background: hovered ? "#f1f5f9" : "#f8fafc",
        cursor: "pointer",
        fontFamily: "var(--font-sora), sans-serif",
        transition: "all .15s",
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: "#e2e8f0",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <TablerIcon name={mode.icon} size={13} color="#64748b" />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>{mode.label}</span>
    </button>
  );
}

function StudyOverallHeader({ subjects }: { subjects: SubjectDef[] }) {
  const totalDone = subjects.reduce((a, s) => a + s.done, 0);
  const totalAll = subjects.reduce((a, s) => a + s.total, 0);
  const pct = Math.round(totalDone / totalAll * 100);

  return (
    <div style={{
      background: "#fff", border: "1.5px solid #e2e8f0",
      borderRadius: 14, padding: "14px 16px", marginBottom: 8,
      fontFamily: "var(--font-sora), sans-serif",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Overall progress</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#8B5CF6", lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--font-dm-sans), sans-serif", marginTop: 2 }}>
            {totalDone} / {totalAll} lessons
          </div>
        </div>
      </div>
      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: "linear-gradient(90deg, #8B5CF6, #3B82F6)",
          borderRadius: 99, transition: "width .8s ease",
        }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        {[
          { label: "In progress", count: subjects.filter(s => s.inProgress).length, color: "#3B82F6" },
          { label: "Not started",  count: subjects.filter(s => !s.inProgress).length, color: "#94a3b8" },
          { label: "Subjects",     count: subjects.length, color: "#8B5CF6" },
        ].map(item => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: 99, background: item.color }} />
            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "var(--font-dm-sans), sans-serif" }}>
              <span style={{ fontWeight: 700, color: "#475569" }}>{item.count}</span> {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const mockCards = [
  {
    q: "What is the difference between SN1 and SN2 reactions?",
    a: "SN1 is unimolecular, proceeds via a carbocation intermediate, and often gives racemization. SN2 is bimolecular, concerted, and gives inversion of configuration.",
  },
  {
    q: "Define Markovnikov's rule.",
    a: "Hydrogen adds to the carbon already bearing more hydrogens, placing the positive charge on the more stable substituted carbon.",
  },
  {
    q: "What reagent converts an alkene to an epoxide?",
    a: "mCPBA, a peracid that transfers oxygen to an alkene in a concerted reaction.",
  },
  {
    q: "Why do polar protic solvents favor SN1?",
    a: "They stabilize both the carbocation intermediate and the leaving group through solvation and hydrogen bonding.",
  },
];

const examQuestions = [
  {
    q: "Which reagent converts an alkene to an epoxide?",
    subject: "Mechanisms",
    opts: ["Ozone / DMS", "mCPBA", "Br2 in CCl4", "H2O2 / NaOH"],
    correct: 1,
    explanation:
      "mCPBA is a peracid that donates one oxygen atom to the alkene in a concerted mechanism.",
  },
  {
    q: "SN2 reactions proceed with what stereochemical outcome?",
    subject: "Stereochemistry",
    opts: ["Retention", "Racemization", "Inversion", "No change"],
    correct: 2,
    explanation:
      "SN2 proceeds through backside attack, which inverts the configuration at the stereocenter.",
  },
  {
    q: "Markovnikov's rule predicts addition of H to which carbon?",
    subject: "Addition reactions",
    opts: ["Less substituted", "More substituted", "Either equally", "Terminal only"],
    correct: 1,
    explanation:
      "Hydrogen adds to the more hydrogen-bearing carbon, placing positive charge on the more substituted carbon.",
  },
  {
    q: "Which solvent best promotes SN1?",
    subject: "Mechanisms",
    opts: ["DMF", "Acetone", "Ethanol/water", "THF"],
    correct: 2,
    explanation:
      "Polar protic solvents stabilize the carbocation and leaving group, favoring ionization.",
  },
];

const pdfPages = [
  {
    title: "Chapter 4: Nucleophilic Substitution",
    text: "Nucleophilic substitution is one of the most fundamental reaction types in organic chemistry. A nucleophile replaces a leaving group on a carbon atom.\n\nThe two primary mechanisms are SN1 and SN2. Knowing which pathway is likely helps predict both rate and stereochemistry.",
  },
  {
    title: "4.1 The SN2 Mechanism",
    text: "In SN2 reactions, the nucleophile attacks as the leaving group departs. This concerted mechanism produces inversion of configuration.\n\nRate = k[substrate][nucleophile]\n\nBest substrates: methyl, primary, then secondary.",
  },
  {
    title: "4.2 The SN1 Mechanism",
    text: "SN1 reactions proceed in two steps: ionization to form a planar carbocation, followed by nucleophilic attack from either face.\n\nRate = k[substrate]\n\nBest substrates: tertiary, then secondary.",
  },
];

const reviewQuestions = [
  {
    id: "r1",
    subject: "Fire Safety Overview",
    q: "In type I buildings, structural components such as walls, ceilings, and floors must be constructed from materials capable of withstanding excessive heat. How long are exterior bearing walls rated to resist collapse?",
    correct: false,
    flagged: false,
    answer: "Up to 12 hours",
    rightAnswer: "3-4 hours",
  },
  {
    id: "r2",
    subject: "Scene Response, First Aid",
    q: "The use of Air-purifying Respirators (APRs) at hazardous materials incidents is approved by NIOSH. Which is NOT one of the three types of canisters used with an APR?",
    correct: false,
    flagged: true,
    answer: "Organic vapor canister",
    rightAnswer: "Combination canister with HEPA",
  },
  {
    id: "r3",
    subject: "Building Materials",
    q: "Which composite building material is made from wood fibers, has a smooth finish, and is commonly used for doors and decorative moldings due to its ability to resemble hardwood?",
    correct: false,
    flagged: true,
    answer: "Plywood",
    rightAnswer: "Medium-density fiberboard (MDF)",
  },
  {
    id: "r4",
    subject: "Fire Safety Overview",
    q: "Emergency personnel should adhere to the ABCs of good communication. What are the ABCs of good communication?",
    correct: true,
    flagged: false,
    answer: "Accuracy, Brevity, Clarity",
    rightAnswer: "Accuracy, Brevity, Clarity",
  },
];

function Icon({
  d,
  className = "",
  size = 18,
}: {
  d: string;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={d} />
    </svg>
  );
}

function UserMenu({
  showName = false,
  className = "",
  menuAlign = "right",
}: {
  showName?: boolean;
  className?: string;
  menuAlign?: "left" | "right" | "center";
}) {
  const [open, setOpen] = useState(false);

  const menuPosition =
    menuAlign === "center"
      ? "left-1/2 -translate-x-1/2"
      : menuAlign === "left"
        ? "left-0"
        : "right-0";

  return (
    <div className={`relative ${className}`}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="User menu"
        className={`flex items-center gap-3 rounded-full transition hover:opacity-90 ${
          showName ? "pr-1" : ""
        }`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-950 text-sm font-black text-white">
          {CURRENT_USER.initial}
        </span>
        {showName ? (
          <span className="text-sm font-extrabold text-slate-950">
            {CURRENT_USER.name}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={`absolute ${menuPosition} z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm font-bold text-slate-700 shadow-xl shadow-slate-200/70`}
          role="menu"
        >
          <button
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            role="menuitem"
            type="button"
          >
            Profile
          </button>
          <button
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            role="menuitem"
            type="button"
          >
            Settings
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-slate-400 hover:bg-slate-50"
            role="menuitem"
            type="button"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TopBar({
  page,
  source,
  folderSources,
  selectedFolderSourceIds,
  onToggleFolderSource,
  onSelectAllFolderSources,
  onClearFolderSourceSelection,
  onAdd,
  onAddSource,
  onBack,
}: {
  page: Page;
  source: Source;
  folderSources: Source[];
  selectedFolderSourceIds: string[];
  onToggleFolderSource: (sourceId: string) => void;
  onSelectAllFolderSources: () => void;
  onClearFolderSourceSelection: () => void;
  onAdd: () => void;
  onAddSource: (source: Source) => void;
  onBack: () => void;
}) {
  const canGoBack = page !== "library" && page !== "add";
  const isDetail = page === "detail";
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const isLibrary = page === "library";
  const isAdd = page === "add";
  const showAddSource = !isDetail && !isAdd;
  const sourceCountLabel = sourcePickerCountLabel(selectedFolderSourceIds);
  const allSourcesSelected = sourcePickerAllSelected(
    selectedFolderSourceIds,
    folderSources,
  );

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/45 px-4 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/35">
        <div className="relative mx-auto flex h-14 max-w-6xl items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {canGoBack && (
              <button
                aria-label="Back"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                onClick={onBack}
              >
                <Icon d="M15 18l-6-6 6-6" size={16} />
              </button>
            )}
            <Link
              aria-label="Go to home"
              className="flex h-10 items-center text-left"
              href="/"
            >
              <Image
                alt="DrNote.co"
                className="h-7 w-auto"
                height={28}
                unoptimized
                src="https://q648y7e0kt.ufs.sh/f/7bppoSdGjTuBsGmvNyR3mYU4jKNLJh5ZQuVOqsSP06Elv89c"
                width={142}
              />
            </Link>
          </div>
          {isDetail && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
              <div className="pointer-events-auto relative">
                <button
                  aria-expanded={sourceMenuOpen}
                  aria-haspopup="dialog"
                  aria-label={`${sourceCountLabel}, open source menu`}
                  className={`flex h-10 items-center gap-2 rounded-xl border px-3 shadow-sm transition ${
                    sourceMenuOpen
                      ? "border-indigo-300 bg-indigo-50/80 ring-2 ring-indigo-500/15"
                      : "border-slate-200/90 bg-white hover:border-indigo-200 hover:bg-indigo-50/40 hover:shadow-md"
                  }`}
                  onClick={() => setSourceMenuOpen((open) => !open)}
                  title={sourceCountLabel}
                  type="button"
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                      allSourcesSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    {allSourcesSelected ? (
                      <Icon d="M20 6L9 17l-5-5" size={14} />
                    ) : (
                      <Icon
                        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"
                        size={14}
                      />
                    )}
                  </span>
                  <span className="whitespace-nowrap text-sm font-extrabold text-slate-900">
                    {sourceCountLabel}
                  </span>
                  <Icon
                    className={`shrink-0 text-slate-400 transition-transform duration-200 ${
                      sourceMenuOpen ? "rotate-180 text-indigo-600" : ""
                    }`}
                    d="M6 9l6 6 6-6"
                    size={14}
                  />
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-1 items-center justify-end gap-2">
            {isDetail && (
              <button
                aria-label={`Score · ${source.progress}% overall`}
                className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                onClick={() => setShowStats(true)}
                title={`View stats (${source.progress}%)`}
                type="button"
              >
                Score
              </button>
            )}
            {!isAdd && (
              <>
                <button
                  aria-expanded={showStreak}
                  aria-haspopup="dialog"
                  aria-label={`${STREAK_COUNT} day streak`}
                  className={`${gameifiedCounterBtn} border-orange-200 bg-[#fff4e6] text-[#ff9600] shadow-[0_2px_0_#ffb84d] hover:bg-[#ffe9c8]`}
                  onClick={() => setShowStreak(true)}
                  title={`${STREAK_COUNT} day streak`}
                  type="button"
                >
                  <Icon
                    className="shrink-0"
                    d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
                    size={16}
                  />
                  {STREAK_COUNT}
                </button>
                <button
                  aria-expanded={showReferrals}
                  aria-haspopup="dialog"
                  aria-label={`${REFERRAL_COUNT} referrals`}
                  className={`${gameifiedCounterBtn} border-sky-200 bg-[#ddf4ff] text-[#1cb0f6] shadow-[0_2px_0_#84d8ff] hover:bg-[#c8ecff]`}
                  onClick={() => setShowReferrals(true)}
                  title={`${REFERRAL_COUNT} referrals`}
                  type="button"
                >
                  {REFERRAL_COUNT}
                </button>
                {showAddSource && (
                  <button
                    className={`${gameifiedActionBtn} border-[#1899d6] bg-[#1cb0f6] text-white shadow-[0_2px_0_#1899d6] hover:bg-[#47bfff]`}
                    onClick={onAdd}
                    type="button"
                  >
                    <Icon d="M12 5v14M5 12h14" size={16} />
                    {isLibrary ? (
                      "new"
                    ) : (
                      <>
                        <span className="hidden sm:inline">Add source</span>
                        <span className="sm:hidden">Add</span>
                      </>
                    )}
                  </button>
                )}
                <UserMenu />
              </>
            )}
          </div>
        </div>
      </header>
      {showStreak && <StreakSidePanel onClose={() => setShowStreak(false)} />}
      {showReferrals && (
        <ReferralsSidePanel onClose={() => setShowReferrals(false)} />
      )}
      {showStats && (
        <StatsSidePanel
          source={source}
          onClose={() => setShowStats(false)}
        />
      )}
      {sourceMenuOpen && isDetail && (
        <FolderSourcesSidePanel
          folderSources={folderSources}
          onAddSource={onAddSource}
          onClearFolderSourceSelection={onClearFolderSourceSelection}
          onClose={() => setSourceMenuOpen(false)}
          onSelectAllFolderSources={onSelectAllFolderSources}
          onToggleFolderSource={onToggleFolderSource}
          selectedFolderSourceIds={selectedFolderSourceIds}
          source={source}
        />
      )}
    </>
  );
}

function LibraryPage({
  onAdd,
  onAddFiles,
  uploadError,
  isProcessingUpload,
}: {
  onAdd: () => void;
  onAddFiles: (files: File[]) => Promise<void>;
  uploadError?: string;
  isProcessingUpload?: boolean;
}) {
  const [files, setFiles] = useState<PdfFileQueueItem[]>([]);
  const [isReady, setIsReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFiles(loadFiles());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isProcessingUpload) {
      setFiles(loadFiles());
    }
  }, [isProcessingUpload]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-9 sm:py-12">
      <DashboardGreeting userName={CURRENT_USER.name} />

      <div className="mb-8">
        <AddSourceCard
          isProcessing={isProcessingUpload}
          onAdd={onAdd}
          onAddFiles={(incoming) => {
            void onAddFiles(incoming);
          }}
        />
      </div>

      <FileList
        dragOver={false}
        files={files}
        isProcessing={Boolean(isProcessingUpload)}
        isReady={isReady}
        onPickFiles={() => fileInputRef.current?.click()}
        showAddButton={false}
        showHeader={false}
        uploadError={uploadError ?? ""}
      />

      <input
        accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.doc,.docx,.txt,.rtf"
        className="hidden"
        multiple
        onChange={(event) => {
          const selected = event.target.files;
          if (selected?.length) {
            void onAddFiles(Array.from(selected));
          }
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
    </main>
  );
}

function sourceDisplayFileName(source: Source) {
  if (source.fileName) return source.fileName;
  if (source.type === "pdf") return `${source.title}.pdf`;
  if (source.type === "link") return source.url ?? source.title;
  return source.title;
}

function DetailPage({
  source,
  folderSources,
  selectedFolderSourceIds,
}: {
  source: Source;
  folderSources: Source[];
  selectedFolderSourceIds: string[];
}) {
  const [queueFiles, setQueueFiles] = useState<PdfFileQueueItem[]>([]);

  useEffect(() => {
    setQueueFiles(loadFiles());
  }, []);

  const selectedSources = folderSources.filter((item) =>
    selectedFolderSourceIds.includes(item.id),
  );
  const activeSource = selectedSources[0] ?? source;
  const displayFileName = sourceDisplayFileName(activeSource);
  const theme = cardThemes[source.color];
  const fileId = useMemo(
    () => resolveQueueFileId(activeSource, queueFiles),
    [activeSource, queueFiles],
  );
  const linkedFile = useMemo(
    () => (fileId ? queueFiles.find((file) => file.id === fileId) : undefined),
    [fileId, queueFiles],
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <section className="mb-8 overflow-hidden rounded-3xl p-6 text-white sm:p-8" style={{ background: theme.cardBg }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-white/75">
            {source.subject}
          </span>
          {sourceStreak(source) > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-white px-[11px] py-1 text-[13px] font-extrabold text-[#1C1C1C] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <Flame color="#F97316" size={13} />
              {sourceStreak(source)}
            </span>
          ) : null}
        </div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          {source.title}
        </h1>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
          <FileText className="size-4 shrink-0 text-white/80" aria-hidden />
          <p className="truncate text-sm font-semibold text-white/95">
            {linkedFile?.name ?? displayFileName}
          </p>
        </div>
        {selectedSources.length > 1 ? (
          <p className="mt-2 text-xs font-medium text-white/70">
            {selectedSources.length} sources selected
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-black tracking-tight text-slate-950">
          Study modes
        </h2>
        {fileId ? (
          <StudyModePicker fileId={fileId} />
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <p className="text-sm font-bold text-slate-900">
              No processed file linked yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Upload a PDF or document to extract questions, then open Flashcards or Quiz
              here — same as your file library.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                className="inline-flex h-11 items-center rounded-full bg-zinc-950 px-6 text-sm font-bold text-white transition hover:bg-zinc-800"
                href="/"
              >
                Upload files
              </Link>
              <Link
                className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                href="/dashboard/files"
              >
                Open library
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function buildSourceFromAddedItem(
  item: AddedItem,
  index: number,
  options: { subject: string; color: ColorKey; queueFileId?: string },
): Source {
  const type: SourceType =
    item.kind === "link" ? "link" : item.kind === "text" ? "text" : "pdf";
  const sourceSubject = options.subject.trim() || "General";
  const title =
    type === "pdf"
      ? item.label.replace(/\.[^/.]+$/, "").slice(0, 56)
      : type === "link"
        ? "Imported website"
        : `${sourceSubject} notes`;
  return {
    id: `${Date.now()}-${index}`,
    type,
    title,
    subject: sourceSubject,
    color: options.color,
    preview:
      type === "pdf"
        ? "Ready to generate summaries, quizzes, flashcards, and review questions from this document."
        : "Ready to generate summaries, quizzes, flashcards, and review questions from this source.",
    cards: type === "pdf" ? 16 : 8,
    progress: 0,
    createdAt: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    url: item.kind === "link" ? item.label : undefined,
    fileName: item.kind === "file" ? item.label : undefined,
    queueFileId: options.queueFileId,
  };
}

function FolderSourcesSidePanel({
  source,
  folderSources,
  selectedFolderSourceIds,
  onToggleFolderSource,
  onSelectAllFolderSources,
  onClearFolderSourceSelection,
  onAddSource,
  onClose,
}: {
  source: Source;
  folderSources: Source[];
  selectedFolderSourceIds: string[];
  onToggleFolderSource: (sourceId: string) => void;
  onSelectAllFolderSources: () => void;
  onClearFolderSourceSelection: () => void;
  onAddSource: (source: Source) => void;
  onClose: () => void;
}) {
  const [pendingItems, setPendingItems] = useState<AddedItem[]>([]);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [textValue, setTextValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const allFolderSelected =
    folderSources.length > 0 &&
    selectedFolderSourceIds.length === folderSources.length;
  const allPendingSelected =
    pendingItems.length > 0 &&
    selectedPendingIds.length === pendingItems.length;

  function appendPendingItems(next: AddedItem[]) {
    if (!next.length) return;
    setPendingItems((current) => [...current, ...next]);
    setSelectedPendingIds((current) => [
      ...current,
      ...next.map((item) => item.id),
    ]);
  }

  function addText() {
    const value = textValue.trim();
    if (!value) return;
    const isLink = /^https?:\/\//i.test(value);
    appendPendingItems([
      {
        id: `${Date.now()}-${pendingItems.length}`,
        kind: isLink ? "link" : "text",
        label: value,
      },
    ]);
    setTextValue("");
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    appendPendingItems(
      Array.from(files).map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        kind: "file" as const,
        label: file.name,
      })),
    );
  }

  function togglePendingItem(itemId: string) {
    setSelectedPendingIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function removePendingItem(itemId: string) {
    setPendingItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedPendingIds((current) => current.filter((id) => id !== itemId));
  }

  function savePending() {
    const toAdd = pendingItems.filter((item) =>
      selectedPendingIds.includes(item.id),
    );
    if (!toAdd.length) return;
    const options = { subject: source.subject, color: source.color };
    toAdd.forEach((item, index) => {
      onAddSource(buildSourceFromAddedItem(item, index, options));
    });
    const addedIds = new Set(toAdd.map((item) => item.id));
    setPendingItems((current) => current.filter((item) => !addedIds.has(item.id)));
    setSelectedPendingIds((current) => current.filter((id) => !addedIds.has(id)));
    if (pendingItems.length === toAdd.length) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/25"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-950">
              {truncateSourceTitle(source.title, 32)}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              Sources in this folder only
            </p>
          </div>
          <button
            aria-label="Close sources menu"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <Icon d="M18 6L6 18M6 6l12 12" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Selected sources
            </p>
            <button
              className="text-xs font-bold text-blue-600 hover:text-blue-700"
              onClick={() => {
                if (allFolderSelected) {
                  onClearFolderSourceSelection();
                } else {
                  onSelectAllFolderSources();
                }
              }}
              type="button"
            >
              {allFolderSelected ? "Clear all" : "Select all"}
            </button>
          </div>

          {folderSources.length === 0 ? (
            <p className="mb-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-medium text-slate-400">
              No sources in this folder yet. Add PDFs, text, or links below.
            </p>
          ) : (
            <div className="mb-6 space-y-1">
              {folderSources.map((item) => {
                const itemColor = colors[item.color];
                const isSelected = selectedFolderSourceIds.includes(item.id);
                return (
                  <button
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:bg-slate-50 ${
                      isSelected ? "text-blue-700" : "text-slate-700"
                    }`}
                    key={item.id}
                    onClick={() => onToggleFolderSource(item.id)}
                    type="button"
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <Icon d="M20 6L9 17l-5-5" size={12} />}
                    </span>
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${itemColor.bg} ${itemColor.border} ${itemColor.text}`}
                    >
                      <Icon d={typeMeta[item.type].icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">
                      {truncateSourceTitle(item.title, 36)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-slate-100 pt-5">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Add to folder
            </p>
            <div
              className={`mb-4 rounded-2xl border-2 border-dashed p-5 text-center transition ${
                dragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-slate-50"
              }`}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                addFiles(event.dataTransfer.files);
              }}
            >
              <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm">
                <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" size={18} />
              </span>
              <p className="text-sm font-extrabold text-slate-900">Drop files here</p>
              <p className="mt-1 text-xs text-slate-400">PDF, docs, text, audio, video</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  onClick={() => fileRef.current?.click()}
                  type="button"
                >
                  PDF
                </button>
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  onClick={() => setTextValue("Paste notes here...")}
                  type="button"
                >
                  Text
                </button>
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  onClick={() => setTextValue("https://")}
                  type="button"
                >
                  Link
                </button>
              </div>
              <input
                accept=".pdf,.doc,.docx,.txt,.mp3,.mp4"
                className="hidden"
                multiple
                onChange={(event) => addFiles(event.target.files)}
                ref={fileRef}
                type="file"
              />
            </div>

            <div className="mb-4 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                onChange={(event) => setTextValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addText();
                }}
                placeholder="Paste a link or note"
                value={textValue}
              />
              <button
                className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                disabled={!textValue.trim()}
                onClick={addText}
                type="button"
              >
                Add
              </button>
            </div>

            {pendingItems.length > 0 && (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Ready to add ({selectedPendingIds.length}/{pendingItems.length})
                  </p>
                  <button
                    className="text-xs font-bold text-blue-600 hover:text-blue-700"
                    onClick={() => {
                      if (allPendingSelected) {
                        setSelectedPendingIds([]);
                      } else {
                        setSelectedPendingIds(
                          pendingItems.map((item) => item.id),
                        );
                      }
                    }}
                    type="button"
                  >
                    {allPendingSelected ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="mb-4 space-y-1">
                {pendingItems.map((item) => {
                  const isSelected = selectedPendingIds.includes(item.id);
                  const itemType = item.kind === "file" ? "pdf" : item.kind;
                  return (
                  <div
                    className={`flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 transition ${
                      isSelected
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-slate-200 bg-white"
                    }`}
                    key={item.id}
                  >
                    <button
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-sm font-bold transition hover:bg-white/80 ${
                        isSelected ? "text-blue-700" : "text-slate-700"
                      }`}
                      onClick={() => togglePendingItem(item.id)}
                      type="button"
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
                          isSelected
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isSelected && <Icon d="M20 6L9 17l-5-5" size={12} />}
                      </span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                        <Icon d={typeMeta[itemType].icon} size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {item.label}
                      </span>
                    </button>
                    <button
                      aria-label={`Remove ${item.label}`}
                      className="shrink-0 rounded-lg p-2 text-slate-300 transition hover:bg-white hover:text-rose-500"
                      onClick={() => removePendingItem(item.id)}
                      type="button"
                    >
                      <Icon d="M18 6L6 18M6 6l12 12" size={14} />
                    </button>
                  </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 p-4">
          <button
            className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            disabled={!selectedPendingIds.length}
            onClick={savePending}
            type="button"
          >
            {selectedPendingIds.length
              ? `Add ${selectedPendingIds.length} source${selectedPendingIds.length > 1 ? "s" : ""} to folder`
              : "Select sources to add"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function StreakSidePanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/25"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">Streak</h2>
          <button
            aria-label="Close streak"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <Icon d="M18 6L6 18M6 6l12 12" size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border-2 border-orange-200 border-b-[5px] bg-[#fff4e6] p-5 text-center shadow-[0_2px_0_#ffb84d]">
            <div className="flex items-center justify-center gap-2">
              <Icon
                className="text-[#ff9600]"
                d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
                size={28}
              />
              <p className="text-4xl font-extrabold tabular-nums text-[#ff9600]">
                {STREAK_COUNT}
              </p>
            </div>
            <p className="mt-1 text-sm font-bold text-orange-800">day streak</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-700">Keep it going</p>
            <p className="mt-1 text-xs text-slate-400">
              Study today to extend your streak. Miss a day and it resets to zero.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ReferralsSidePanel({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(REFERRAL_LINK);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/25"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">Referrals</h2>
          <button
            aria-label="Close referrals"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <Icon d="M18 6L6 18M6 6l12 12" size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border-2 border-sky-200 border-b-[5px] bg-[#ddf4ff] p-5 text-center shadow-[0_2px_0_#84d8ff]">
            <p className="text-4xl font-extrabold tabular-nums text-[#1cb0f6]">
              {REFERRAL_COUNT}
            </p>
            <p className="mt-1 text-sm font-bold text-sky-800">
              friends joined with your link
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-700">Invite friends</p>
            <p className="mt-1 text-xs text-slate-400">
              Share your link. When they sign up, they count toward your referrals.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none"
                readOnly
                value={REFERRAL_LINK}
              />
              <button
                className="shrink-0 rounded-lg bg-[#1cb0f6] px-3 py-2 text-xs font-extrabold text-white transition hover:bg-[#1899d6]"
                onClick={copyLink}
                type="button"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Recent
            </p>
            <ul className="space-y-2">
              {REFERRALS.map((referral) => (
                <li
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                  key={referral.name}
                >
                  <span className="text-sm font-bold text-slate-800">
                    {referral.name}
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {referral.joined}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

function StatsSidePanel({ source, onClose }: { source: Source; onClose: () => void }) {
  const subjectProgress = subjectsList.map((subject, index) => {
    const totals = [12, 18, 16, 14, 10];
    const completed = [8, 11, 9, 0, 0];
    return { subject, completed: completed[index], total: totals[index] };
  });
  const totalDone = subjectProgress.reduce((a, s) => a + s.completed, 0);
  const totalAll = subjectProgress.reduce((a, s) => a + s.total, 0);
  const overallPct = Math.round((totalDone / totalAll) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/25"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">Stats</h2>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50" onClick={onClose}>
            <Icon d="M18 6L6 18M6 6l12 12" size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {/* Progress */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">Progress</span>
              <span className="text-xl font-black text-indigo-600">{source.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${source.progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">Overall completion across all topics in this source.</p>
          </div>
          {/* Cards */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">Cards ready</span>
              <span className="text-xl font-black text-slate-900">{source.cards}</span>
            </div>
            <p className="text-xs text-slate-400">Flashcards generated and available for Flashcards or Quick 10 mode.</p>
          </div>
          {/* Streak */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">Streak</span>
              <span className="text-xl font-black text-orange-500">3 days 🔥</span>
            </div>
            <p className="text-xs text-slate-400">Days studied in a row. Keep going to maintain your streak.</p>
          </div>
          {/* Per-subject */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">Overall topics</span>
              <span className="text-sm font-black text-indigo-600">{overallPct}%</span>
            </div>
            <div className="space-y-2">
              {subjectProgress.map((s) => {
                const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
                return (
                  <div key={s.subject}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-600">{s.subject}</span>
                      <span className="font-bold text-slate-500">{s.completed}/{s.total}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CheckBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition ${
        checked
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-300 bg-white text-transparent"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      type="button"
    >
      <Icon d="M20 6L9 17l-5-5" size={13} />
    </button>
  );
}

function QuizSettingsPanel({
  settings,
  onSave,
  onClose,
  title = "Quiz Settings",
  primaryAction = "Save Settings",
}: {
  settings: QuizSettings;
  onSave: (settings: QuizSettings) => void;
  onClose: () => void;
  title?: string;
  primaryAction?: string;
}) {
  const [localSettings, setLocalSettings] = useState<QuizSettings>({
    ...settings,
  });
  const allSubjectsOn = localSettings.subjects.length === subjectsList.length;

  function toggleSubject(subject: string) {
    setLocalSettings((current) => ({
      ...current,
      subjects: current.subjects.includes(subject)
        ? current.subjects.filter((item) => item !== subject)
        : [...current.subjects, subject],
    }));
  }

  function toggleBoolean(key: keyof Pick<
    QuizSettings,
    "includeNew" | "includeAnswered" | "includeFlagged" | "includeIncorrect"
  >) {
    setLocalSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/25"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          <button
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <Icon d="M18 6L6 18M6 6l12 12" size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="mb-4 text-sm font-semibold leading-6 text-slate-500">
            These controls will be default settings for all of your quiz modes.
          </p>

          <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200">
            {[
              ["asIGo", "Show answers as I go"],
              ["atEnd", "Show answers at the end"],
            ].map(([value, label]) => (
              <button
                className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-b-0"
                key={value}
                onClick={() =>
                  setLocalSettings((current) => ({
                    ...current,
                    showAnswers: value as QuizSettings["showAnswers"],
                  }))
                }
              >
                <span
                  className={`text-sm ${
                    localSettings.showAnswers === value
                      ? "font-bold text-slate-950"
                      : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
                {localSettings.showAnswers === value && (
                  <Icon className="text-blue-600" d="M20 6L9 17l-5-5" />
                )}
              </button>
            ))}
          </div>

          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200">
            {[
              ["manual", 'Manual Submit (Click "Check Answer" Button)'],
              ["auto", "Automatic Submit (Click Answer)"],
            ].map(([value, label]) => (
              <button
                className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-b-0"
                key={value}
                onClick={() =>
                  setLocalSettings((current) => ({
                    ...current,
                    submitMode: value as QuizSettings["submitMode"],
                  }))
                }
              >
                <span
                  className={`text-sm ${
                    localSettings.submitMode === value
                      ? "font-bold text-slate-950"
                      : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
                {localSettings.submitMode === value && (
                  <Icon className="text-blue-600" d="M20 6L9 17l-5-5" />
                )}
              </button>
            ))}
          </div>

          <h3 className="mb-1 text-sm font-black text-slate-950">
            Adjust Subjects
          </h3>
          <p className="mb-3 text-sm leading-6 text-slate-400">
            Turn off a subject to hide all questions for that subject.
          </p>
          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200">
            <button
              className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left"
              onClick={() =>
                setLocalSettings((current) => ({
                  ...current,
                  subjects: allSubjectsOn ? [] : [...subjectsList],
                }))
              }
            >
              <span className="text-sm font-black text-slate-950">
                All Subjects
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-400">
                  {localSettings.subjects.length} of {subjectsList.length}
                </span>
                <CheckBox
                  checked={allSubjectsOn}
                  onChange={() =>
                    setLocalSettings((current) => ({
                      ...current,
                      subjects: allSubjectsOn ? [] : [...subjectsList],
                    }))
                  }
                />
              </div>
            </button>
            {subjectsList.map((subject) => (
              <button
                className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-3 text-left"
                key={subject}
                onClick={() => toggleSubject(subject)}
              >
                <span className="text-sm font-semibold text-slate-700">
                  {subject}
                </span>
                <CheckBox
                  checked={localSettings.subjects.includes(subject)}
                  onChange={() => toggleSubject(subject)}
                />
              </button>
            ))}
          </div>

          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Include:
              </span>
            </div>
            {[
              ["includeNew", "New Questions", 24],
              ["includeAnswered", "Answered Questions", 4],
              ["includeFlagged", "Flagged Questions", 0],
              ["includeIncorrect", "Incorrect Questions", 3],
            ].map(([key, label, count]) => (
              <button
                className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-b-0"
                key={String(key)}
                onClick={() =>
                  toggleBoolean(
                    key as keyof Pick<
                      QuizSettings,
                      | "includeNew"
                      | "includeAnswered"
                      | "includeFlagged"
                      | "includeIncorrect"
                    >,
                  )
                }
              >
                <span className="text-sm font-semibold text-slate-700">
                  {label}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400">
                    {count}
                  </span>
                  <CheckBox
                    checked={
                      localSettings[
                        key as keyof Pick<
                          QuizSettings,
                          | "includeNew"
                          | "includeAnswered"
                          | "includeFlagged"
                          | "includeIncorrect"
                        >
                      ]
                    }
                    onChange={() =>
                      toggleBoolean(
                        key as keyof Pick<
                          QuizSettings,
                          | "includeNew"
                          | "includeAnswered"
                          | "includeFlagged"
                          | "includeIncorrect"
                        >,
                      )
                    }
                  />
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                How many questions?
              </span>
              <input
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm font-bold outline-none focus:border-blue-500"
                max={250}
                min={1}
                onChange={(event) =>
                  setLocalSettings((current) => ({
                    ...current,
                    questionCount: Math.max(
                      1,
                      Math.min(250, Number(event.target.value) || 1),
                    ),
                  }))
                }
                type="number"
                value={localSettings.questionCount}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400">1</span>
              <input
                className="flex-1"
                max={250}
                min={1}
                onChange={(event) =>
                  setLocalSettings((current) => ({
                    ...current,
                    questionCount: Number(event.target.value),
                  }))
                }
                type="range"
                value={localSettings.questionCount}
              />
              <span className="text-xs font-semibold text-slate-400">250</span>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row">
          <button
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 sm:flex-[2]"
            onClick={() => onSave(localSettings)}
            type="button"
          >
            {primaryAction}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function PDFViewer({ source, onBack }: { source: Source; onBack: () => void }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const page = pdfPages[pageIndex];
  const c = colors[source.color];

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex h-14 shrink-0 items-center justify-between bg-slate-950 px-4">
        <button
          className="flex items-center gap-2 text-sm font-bold text-slate-300"
          onClick={onBack}
        >
          <Icon d="M15 18l-6-6 6-6" size={16} />
          Back
        </button>
        <p className="max-w-[42vw] truncate text-sm font-bold text-white">
          {source.title}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-slate-300"
            onClick={() => setZoom((current) => Math.max(50, current - 25))}
          >
            <Icon d="M5 12h14" size={15} />
          </button>
          <span className="w-12 text-center text-xs font-bold text-slate-400">
            {zoom}%
          </span>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-slate-300"
            onClick={() => setZoom((current) => Math.min(200, current + 25))}
          >
            <Icon d="M12 5v14M5 12h14" size={15} />
          </button>
        </div>
      </header>
      <section className="flex flex-1 justify-center overflow-auto p-4 sm:p-10">
        <article
          className="h-fit w-full max-w-3xl rounded-xl bg-white p-8 shadow-2xl shadow-slate-300/70 sm:p-14"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top center",
          }}
        >
          <div className={`mb-8 flex items-center gap-2 border-b pb-4 ${c.border}`}>
            <span className={`h-2.5 w-2.5 rounded ${c.accent}`} />
            <span className={`text-xs font-black uppercase tracking-[0.18em] ${c.text}`}>
              {source.subject}
            </span>
          </div>
          <h1 className="mb-6 text-2xl font-black tracking-tight text-slate-950">
            {page.title}
          </h1>
          {page.text.split("\n\n").map((paragraph) => (
            <p
              className="mb-5 text-base leading-8 text-slate-700"
              key={paragraph}
            >
              {paragraph}
            </p>
          ))}
          <footer className="mt-12 flex justify-between border-t border-slate-100 pt-4 text-xs text-slate-300">
            <span>{source.title}</span>
            <span>
              Page {pageIndex + 1} of {pdfPages.length}
            </span>
          </footer>
        </article>
      </section>
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 disabled:text-slate-300"
          disabled={pageIndex === 0}
          onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
        >
          Previous
        </button>
        <div className="flex gap-2">
          {pdfPages.map((_, index) => (
            <button
              aria-label={`Go to page ${index + 1}`}
              className={`h-2.5 w-2.5 rounded-full ${
                index === pageIndex ? c.accent : "bg-slate-200"
              }`}
              key={index}
              onClick={() => setPageIndex(index)}
            />
          ))}
        </div>
        <button
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-300"
          disabled={pageIndex === pdfPages.length - 1}
          onClick={() =>
            setPageIndex((current) => Math.min(pdfPages.length - 1, current + 1))
          }
        >
          Next
        </button>
      </footer>
    </main>
  );
}

function StudyMode({ source, onBack }: { source: Source; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const c = colors[source.color];
  const card = mockCards[index];

  return (
    <ModeShell source={source} title="Study mode" onBack={onBack}>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${c.accent}`}
            style={{ width: `${(index / mockCards.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-bold text-slate-400">
          {index + 1} / {mockCards.length}
        </span>
      </div>
      <button
        className={`mb-5 flex min-h-64 w-full flex-col justify-between rounded-3xl border p-7 text-left transition ${flipped ? `${c.bg} ${c.border}` : "border-slate-200 bg-white"}`}
        onClick={() => setFlipped((current) => !current)}
      >
        <span className={`text-xs font-black uppercase tracking-[0.18em] ${flipped ? c.text : "text-slate-300"}`}>
          {flipped ? "Answer" : "Question"}
        </span>
        <p className="my-8 text-lg font-bold leading-8 text-slate-950">
          {flipped ? card.a : card.q}
        </p>
        <span className="self-end text-xs font-bold text-slate-300">
          Tap to {flipped ? "hide" : "reveal"}
        </span>
      </button>
      <div className="grid grid-cols-3 gap-2">
        <button
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 disabled:text-slate-300"
          disabled={index === 0}
          onClick={() => {
            setIndex((current) => Math.max(0, current - 1));
            setFlipped(false);
          }}
        >
          Back
        </button>
        <button
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
          onClick={() => setFlipped((current) => !current)}
        >
          Flip
        </button>
        <button
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-200"
          disabled={index === mockCards.length - 1}
          onClick={() => {
            setIndex((current) => Math.min(mockCards.length - 1, current + 1));
            setFlipped(false);
          }}
        >
          Next
        </button>
      </div>
    </ModeShell>
  );
}

function ExamMode({ source, onBack }: { source: Source; onBack: () => void }) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(examQuestions.length).fill(null),
  );
  const [done, setDone] = useState(false);
  const question = examQuestions[questionIndex];
  const score = answers.filter(
    (answer, index) => answer === examQuestions[index].correct,
  ).length;

  function submit() {
    if (selected === null) return;
    setAnswers((current) => {
      const next = [...current];
      next[questionIndex] = selected;
      return next;
    });
    setRevealed(true);
  }

  function next() {
    if (questionIndex < examQuestions.length - 1) {
      setQuestionIndex((current) => current + 1);
      setSelected(null);
      setRevealed(false);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <ModeShell source={source} title="Results" onBack={onBack}>
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <p className={`text-6xl font-black ${score >= 3 ? "text-emerald-600" : "text-rose-600"}`}>
            {score}/{examQuestions.length}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {score >= 3 ? "Strong pass. Keep reviewing flagged items." : "Review the explanations and retry."}
          </p>
          <button
            className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white"
            onClick={() => {
              setQuestionIndex(0);
              setSelected(null);
              setRevealed(false);
              setAnswers(Array(examQuestions.length).fill(null));
              setDone(false);
            }}
          >
            Retry exam
          </button>
        </div>
      </ModeShell>
    );
  }

  return (
    <ModeShell source={source} title="Timed quiz" onBack={onBack}>
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400">
          Q {questionIndex + 1} of {examQuestions.length}
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
          12:34
        </span>
        <span className="text-xs font-bold text-slate-400">
          {question.subject}
        </span>
      </div>
      <h1 className="mb-5 text-xl font-black leading-8 text-slate-950">
        {question.q}
      </h1>
      <div className="mb-5 space-y-2">
        {question.opts.map((option, index) => {
          const right = revealed && index === question.correct;
          const wrong = revealed && index === selected && index !== question.correct;
          const active = !revealed && selected === index;
          return (
            <button
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-sm transition ${
                right
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : wrong
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : active
                      ? "border-blue-200 bg-blue-50 text-blue-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              disabled={revealed}
              key={option}
              onClick={() => setSelected(index)}
            >
              <span
                className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                  active || right
                    ? "border-blue-600 bg-blue-600"
                    : wrong
                      ? "border-rose-500 bg-rose-500"
                      : "border-slate-300"
                }`}
              />
              <span className="font-semibold">{option}</span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-sm font-black text-slate-800">Explanation</p>
          <p className="text-sm leading-6 text-slate-600">
            {question.explanation}
          </p>
        </div>
      )}
      {revealed ? (
        <button
          className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-white"
          onClick={next}
        >
          {questionIndex < examQuestions.length - 1 ? "Next question" : "See results"}
        </button>
      ) : (
        <button
          className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
          disabled={selected === null}
          onClick={submit}
        >
          Check answer
        </button>
      )}
    </ModeShell>
  );
}

function FlashcardsMode({
  source,
  onBack,
}: {
  source: Source;
  onBack: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Array<"got" | "missed">>([]);
  const done = index >= mockCards.length;
  const got = results.filter((result) => result === "got").length;
  const card = mockCards[index];
  const c = colors[source.color];

  function answer(result: "got" | "missed") {
    setResults((current) => [...current, result]);
    setIndex((current) => current + 1);
    setFlipped(false);
  }

  if (done) {
    return (
      <ModeShell source={source} title="Flashcards" onBack={onBack}>
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <p className={`text-6xl font-black ${got >= 2 ? "text-emerald-600" : "text-rose-600"}`}>
            {got}/{mockCards.length}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            cards recalled correctly
          </p>
          <button
            className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white"
            onClick={() => {
              setIndex(0);
              setFlipped(false);
              setResults([]);
            }}
          >
            Study again
          </button>
        </div>
      </ModeShell>
    );
  }

  return (
    <ModeShell source={source} title="Flashcards" onBack={onBack}>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${c.accent}`}
            style={{ width: `${(index / mockCards.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-bold text-slate-400">
          {index + 1}/{mockCards.length}
        </span>
      </div>
      <div className="mb-4 flex gap-2">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          {got} got
        </span>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">
          {results.filter((result) => result === "missed").length} missed
        </span>
      </div>
      <button
        className={`mb-4 flex min-h-64 w-full flex-col justify-between rounded-3xl border p-7 text-left transition ${flipped ? `${c.bg} ${c.border}` : "border-slate-200 bg-white"}`}
        onClick={() => setFlipped((current) => !current)}
      >
        <span
          className={`text-xs font-black uppercase tracking-[0.18em] ${
            flipped ? c.text : "text-slate-300"
          }`}
        >
          {flipped ? "Answer" : "Question"}
        </span>
        <p className="my-8 text-lg font-bold leading-8 text-slate-950">
          {flipped ? card.a : card.q}
        </p>
        <span className="self-end text-xs font-bold text-slate-300">
          Tap to {flipped ? "hide" : "flip"}
        </span>
      </button>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-black text-rose-800"
          onClick={() => answer("missed")}
          disabled={!flipped}
        >
          Missed
        </button>
        <button
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800"
          onClick={() => answer("got")}
          disabled={!flipped}
        >
          Got it
        </button>
      </div>
      {!flipped && (
        <button
          className="mt-3 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white"
          onClick={() => setFlipped(true)}
        >
          Show answer
        </button>
      )}
    </ModeShell>
  );
}

function SummaryMode({
  source,
  onBack,
}: {
  source: Source;
  onBack: () => void;
}) {
  const c = colors[source.color];
  return (
    <ModeShell source={source} title="Summary" onBack={onBack}>
      <div className="space-y-4">
        {[
          [
            "Key concepts",
            "SN1 proceeds through a carbocation intermediate and is favored by tertiary substrates and polar protic solvents. SN2 is concerted and favored by primary substrates, strong nucleophiles, and polar aprotic solvents.",
          ],
          [
            "Chapter overview",
            "The document connects mechanism choice to structure, nucleophile strength, leaving group ability, solvent effects, and stereochemical outcomes.",
          ],
          [
            "Weak spots",
            "Your recent answers show errors around inversion versus racemization and solvent effects. Prioritize those before timed practice.",
          ],
        ].map(([title, body], index) => (
          <article
            className={`rounded-2xl border p-5 ${
              index === 0 ? `${c.bg} ${c.border}` : "border-slate-200 bg-white"
            }`}
            key={title}
          >
            <h2 className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-slate-500">
              {title}
            </h2>
            <p className="text-sm leading-7 text-slate-700">{body}</p>
          </article>
        ))}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Topics covered
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              "SN1",
              "SN2",
              "Carbocations",
              "Markovnikov",
              "Epoxides",
              "Stereochemistry",
              "mCPBA",
              "Leaving groups",
            ].map((tag) => (
              <span
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${c.bg} ${c.border} ${c.text}`}
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ModeShell>
  );
}

function ReviewPage({
  source,
  onBack,
  onDetail,
}: {
  source: Source;
  onBack: () => void;
  onDetail: (index: number) => void;
}) {
  const [tab, setTab] = useState<"all" | "flagged" | "incorrect" | "correct">(
    "all",
  );
  const [search, setSearch] = useState("");
  const filtered = reviewQuestions.filter((question) => {
    const matchesTab =
      tab === "all" ||
      (tab === "flagged" && question.flagged) ||
      (tab === "incorrect" && !question.correct) ||
      (tab === "correct" && question.correct);
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      question.q.toLowerCase().includes(term) ||
      question.subject.toLowerCase().includes(term);
    return matchesTab && matchesSearch;
  });

  return (
    <ModeShell source={source} title="Review questions" onBack={onBack}>
      <div className="mb-6 grid grid-cols-4 border-b border-slate-200">
        {[
          ["all", "All"],
          ["flagged", "Flagged"],
          ["incorrect", "Incorrect"],
          ["correct", "Correct"],
        ].map(([key, label]) => (
          <button
            className={`border-b-2 px-2 py-3 text-sm font-black ${
              tab === key
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-400"
            }`}
            key={key}
            onClick={() => setTab(key as typeof tab)}
          >
            {label}
            <span className="mt-1 block text-xl">
              {
                reviewQuestions.filter((question) => {
                  if (key === "flagged") return question.flagged;
                  if (key === "incorrect") return !question.correct;
                  if (key === "correct") return question.correct;
                  return true;
                }).length
              }
            </span>
          </button>
        ))}
      </div>
      <label className="relative mb-5 block">
        <Icon
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
          d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          size={16}
        />
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search Answered Questions"
          value={search}
        />
      </label>
      <div className="space-y-3">
        {filtered.map((question) => (
          <button
            className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:shadow-lg hover:shadow-slate-200/70"
            key={question.id}
            onClick={() => onDetail(reviewQuestions.indexOf(question))}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-black text-slate-400">
                {question.subject}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-black ${
                  question.correct
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {question.correct ? "Correct" : "Missed"}
              </span>
            </div>
            <p className="text-sm font-semibold leading-7 text-slate-900">
              {question.q}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <span className="block text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                  Your answer
                </span>
                <span className="mt-1 block font-bold text-slate-700">
                  {question.answer}
                </span>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-sm">
                <span className="block text-xs font-black uppercase tracking-[0.14em] text-emerald-500">
                  Correct answer
                </span>
                <span className="mt-1 block font-bold text-emerald-800">
                  {question.rightAnswer}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </ModeShell>
  );
}

function ReviewDetail({
  source,
  startIndex,
  onBack,
}: {
  source: Source;
  startIndex: number;
  onBack: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const question = reviewQuestions[index];
  const options = [
    question.rightAnswer,
    question.answer,
    "Distractor B",
    "Distractor C",
  ].filter((option, optionIndex, list) => list.indexOf(option) === optionIndex);

  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between bg-slate-950 px-4">
        <button
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"
          onClick={onBack}
        >
          <Icon d="M15 18l-6-6 6-6" size={16} />
          Back to Review
        </button>
        <span className="text-sm font-bold text-slate-300">All Answered</span>
        <span className="text-xs font-semibold text-slate-500">
          {index + 1} / {reviewQuestions.length}
        </span>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[240px_1fr_300px]">
        <aside className="hidden overflow-y-auto bg-slate-950 p-3 lg:block">
          <div className="mb-2 flex items-center justify-between px-2 py-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">
              Questions
            </span>
            <Icon className="text-slate-600" d="M3 6h18M6 12h12M9 18h6" />
          </div>
          <div className="space-y-1">
            {reviewQuestions.map((item, itemIndex) => (
              <button
                className={`w-full rounded-xl px-3 py-3 text-left text-xs leading-5 transition ${
                  itemIndex === index
                    ? "bg-white/10 text-slate-100"
                    : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                }`}
                key={item.id}
                onClick={() => setIndex(itemIndex)}
              >
                {item.q.slice(0, 84)}
                {item.q.length > 84 ? "..." : ""}
              </button>
            ))}
          </div>
        </aside>

        <article className="overflow-y-auto px-4 py-6 sm:px-8 lg:py-9">
          <p className="mb-3 text-xs font-black text-slate-400">
            {question.subject}
          </p>
          <h1 className="mb-7 max-w-4xl text-lg font-black leading-8 text-slate-950">
            {question.q}
          </h1>
          <div className="space-y-3">
            {options.map((option) => {
              const isRight = option === question.rightAnswer;
              const isWrong =
                option === question.answer && !question.correct && !isRight;
              return (
                <div
                  className={`flex items-center gap-3 rounded-2xl border p-4 ${
                    isRight
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : isWrong
                        ? "border-rose-200 bg-rose-50 text-rose-900"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                  key={option}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                      isRight
                        ? "bg-emerald-500 text-white"
                        : isWrong
                          ? "bg-rose-500 text-white"
                          : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {isRight && <Icon d="M20 6L9 17l-5-5" size={12} />}
                    {isWrong && <Icon d="M18 6L6 18M6 6l12 12" size={12} />}
                  </span>
                  <span className="text-sm font-bold">{option}</span>
                </div>
              );
            })}
          </div>
        </article>

        <aside className="overflow-y-auto border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0 lg:p-7">
          <h2 className="mb-2 text-lg font-black text-slate-950">
            Explanation Details
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Correct answer:{" "}
            <strong className="text-slate-950">{question.rightAnswer}</strong>
          </p>
          <p className="mb-5 text-sm leading-7 text-slate-700">
            The correct answer relates to the definitions and properties in the
            source material. Reviewing the underlying principle helps separate
            the correct option from close distractors.
          </p>
          <p className="mb-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            Reference
          </p>
          <p className="text-sm italic leading-7 text-slate-400">
            {source.title}, Chapter 4, p. 89-94. Comprehensive Review, 3rd
            Edition, pp. 112-118.
          </p>
        </aside>
      </section>

      <footer className="flex h-14 shrink-0 items-center justify-between bg-slate-950 px-6">
        <Icon className="text-slate-700" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
        <div className="flex items-center gap-6">
          <button
            className="text-slate-200 disabled:cursor-not-allowed disabled:text-slate-700"
            disabled={index === 0}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            <Icon d="M15 18l-6-6 6-6" size={24} />
          </button>
          <Icon className="text-slate-700" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
          <button
            className="text-slate-200 disabled:cursor-not-allowed disabled:text-slate-700"
            disabled={index === reviewQuestions.length - 1}
            onClick={() =>
              setIndex((current) =>
                Math.min(reviewQuestions.length - 1, current + 1),
              )
            }
          >
            <Icon d="M9 18l6-6-6-6" size={24} />
          </button>
        </div>
        <Icon className="text-slate-700" d="M4 4h16v16H4zM4 9h16M9 4v16" />
      </footer>
    </main>
  );
}

function ModeShell({
  title,
  source,
  onBack,
  children,
}: {
  title: string;
  source: Source;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-8 flex items-center gap-3">
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600"
          onClick={onBack}
        >
          <Icon d="M15 18l-6-6 6-6" size={18} />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">
            {title}
          </p>
          <p className="truncate text-base font-black text-slate-950">
            {source.title}
          </p>
        </div>
      </div>
      {children}
    </main>
  );
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>([
    ...seedSources,
    ...seedFolderSources,
  ]);
  const [page, setPage] = useState<Page>("library");
  const [selected, setSelected] = useState<Source | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [selectedFolderSourceIds, setSelectedFolderSourceIds] = useState<
    string[]
  >([]);
  const [uploadError, setUploadError] = useState("");
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const librarySources = useMemo(
    () => sources.filter((source) => !source.parentId),
    [sources],
  );
  const activeSource = selected ?? librarySources[0];
  const folderSources = useMemo(
    () => sources.filter((source) => source.parentId === activeSource.id),
    [sources, activeSource.id],
  );

  useEffect(() => {
    setSelectedFolderSourceIds(folderSources.map((source) => source.id));
  }, [activeSource.id, folderSources]);

  function openSource(source: Source) {
    setSelected(source);
    setPage("detail");
  }

  function go(pageName: Page) {
    if (pageName === "library" || pageName === "add") {
      setSelected(null);
    }
    setPage(pageName);
  }

  function addSource(source: Source) {
    const nextSource =
      page === "detail" && !source.parentId
        ? { ...source, parentId: activeSource.id }
        : source;
    setSources((current) => [nextSource, ...current]);
  }

  async function handleAddFiles(files: File[]) {
    const supported = filterSupportedUploadFiles(files);
    if (!supported.length) {
      setUploadError("Unsupported file type. Try PDF, Word, images, or text.");
      return;
    }

    setUploadError("");
    setIsProcessingUpload(true);

    try {
      const queue = await processPdfUploads(supported, { append: true });
      supported.forEach((file, index) => {
        const queueItem =
          queue.find((item) => item.name === file.name) ??
          queue[queue.length - supported.length + index];
        addSource(
          buildSourceFromAddedItem(
            {
              id: `${Date.now()}-${index}-${file.name}`,
              kind: "file",
              label: file.name,
            },
            index,
            {
              subject: "General",
              color: "indigo",
              queueFileId: queueItem?.id,
            },
          ),
        );
      });
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "File extraction failed.",
      );
    } finally {
      setIsProcessingUpload(false);
    }
  }

  function toggleFolderSource(sourceId: string) {
    setSelectedFolderSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId],
    );
  }

  if (page === "pdfview") {
    return <PDFViewer source={activeSource} onBack={() => setPage("detail")} />;
  }

  if (page === "review_detail") {
    return (
      <ReviewDetail
        onBack={() => setPage("review")}
        source={activeSource}
        startIndex={reviewIndex}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <TopBar
        folderSources={folderSources}
        onAdd={() => go("add")}
        onAddSource={addSource}
        onBack={() => (page === "detail" ? go("library") : setPage("detail"))}
        onClearFolderSourceSelection={() => setSelectedFolderSourceIds([])}
        onSelectAllFolderSources={() =>
          setSelectedFolderSourceIds(folderSources.map((item) => item.id))
        }
        onToggleFolderSource={toggleFolderSource}
        page={page}
        selectedFolderSourceIds={selectedFolderSourceIds}
        source={activeSource}
      />
      {page === "library" && (
        <LibraryPage
          isProcessingUpload={isProcessingUpload}
          onAdd={() => go("add")}
          onAddFiles={handleAddFiles}
          uploadError={uploadError}
        />
      )}
      {page === "add" && (
        <AddPage onDone={() => go("library")} />
      )}
      {page === "detail" && (
        <DetailPage
          folderSources={folderSources}
          selectedFolderSourceIds={selectedFolderSourceIds}
          source={activeSource}
        />
      )}
      {page === "study" && (
        <StudyMode source={activeSource} onBack={() => setPage("detail")} />
      )}
      {page === "exam" && (
        <ExamMode source={activeSource} onBack={() => setPage("detail")} />
      )}
      {page === "flashcards" && (
        <FlashcardsMode source={activeSource} onBack={() => setPage("detail")} />
      )}
      {page === "summary" && (
        <SummaryMode source={activeSource} onBack={() => setPage("detail")} />
      )}
      {page === "review" && (
        <ReviewPage
          onBack={() => setPage("detail")}
          onDetail={(index) => {
            setReviewIndex(index);
            setPage("review_detail");
          }}
          source={activeSource}
        />
      )}
    </div>
  );
}
