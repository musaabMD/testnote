import type { Exam } from "@/lib/exams";

export type OnboardingExamOption = Pick<
  Exam,
  "slug" | "name" | "countryName" | "category" | "sortOrder"
>;

export type OnboardingExamSuggestion = {
  slug: string;
  confidence: number;
  reason: string;
};

export const ONBOARDING_EXAM_OPTIONS = [
  {
    slug: "smle",
    name: "SMLE",
    category: "Medical",
    countryName: "Saudi Arabia",
    sortOrder: 10,
  },
  {
    slug: "family-medicine",
    name: "Family Medicine",
    category: "Medical",
    countryName: "Saudi Arabia",
    sortOrder: 20,
  },
  {
    slug: "sdle",
    name: "SDLE",
    category: "Dental",
    countryName: "Saudi Arabia",
    sortOrder: 30,
  },
  {
    slug: "sple",
    name: "SPLE",
    category: "Pharmacy",
    countryName: "Saudi Arabia",
    sortOrder: 40,
  },
  {
    slug: "snle",
    name: "SNLE",
    category: "Nursing",
    countryName: "Saudi Arabia",
    sortOrder: 50,
  },
  {
    slug: "slle",
    name: "SLLE",
    category: "Laboratory",
    countryName: "Saudi Arabia",
    sortOrder: 60,
  },
  {
    slug: "radiology",
    name: "Radiology",
    category: "Radiology",
    countryName: "Saudi Arabia",
    sortOrder: 70,
  },
  {
    slug: "saudi-prometric",
    name: "Saudi Prometric",
    category: "Medical",
    countryName: "Saudi Arabia",
    sortOrder: 80,
  },
] as const satisfies readonly OnboardingExamOption[];

const ONBOARDING_EXAM_SLUGS = new Set<string>(
  ONBOARDING_EXAM_OPTIONS.map((exam) => exam.slug),
);

export function isOnboardingExamSlug(slug: string) {
  return ONBOARDING_EXAM_SLUGS.has(slug);
}

export function getOnboardingExamOptions(
  exams: Exam[] | undefined,
): OnboardingExamOption[] {
  const catalogMatches =
    exams
      ?.filter((exam) => isOnboardingExamSlug(exam.slug))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) ??
    [];

  if (catalogMatches.length === ONBOARDING_EXAM_OPTIONS.length) {
    return catalogMatches;
  }

  return [...ONBOARDING_EXAM_OPTIONS];
}

export function normalizeOnboardingExamSuggestions(value: unknown) {
  const items = Array.isArray((value as { suggestions?: unknown[] } | null)?.suggestions)
    ? (value as { suggestions: unknown[] }).suggestions
    : Array.isArray(value)
      ? value
      : [];
  const seen = new Set<string>();
  const suggestions: OnboardingExamSuggestion[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      slug?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };
    const slug = typeof candidate.slug === "string" ? candidate.slug : "";
    if (!isOnboardingExamSlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    suggestions.push({
      slug,
      confidence: clampConfidence(candidate.confidence),
      reason: cleanReason(candidate.reason),
    });
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
}

export function rankOnboardingExamOptions<T extends OnboardingExamOption>(
  options: readonly T[],
  suggestions: readonly OnboardingExamSuggestion[],
) {
  const rank = new Map(suggestions.map((suggestion, index) => [suggestion.slug, index]));
  return [...options].sort((a, b) => {
    const aRank = rank.get(a.slug);
    const bRank = rank.get(b.slug);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  });
}

export function heuristicOnboardingExamSuggestions(input: {
  fileNames?: string[];
  locale?: string;
  timeZone?: string;
  text?: string;
}) {
  const haystack = [
    ...(input.fileNames ?? []),
    input.locale ?? "",
    input.timeZone ?? "",
    input.text ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const matches: OnboardingExamSuggestion[] = [];
  const add = (slug: string, confidence: number, reason: string) => {
    if (!isOnboardingExamSlug(slug) || matches.some((item) => item.slug === slug)) return;
    matches.push({ slug, confidence, reason });
  };

  if (/\b(sdle|dental|dentist|dentistry)\b/.test(haystack)) {
    add("sdle", 0.88, "Dental terms were found in the upload.");
  }
  if (/\b(sple|pharmacy|pharmacist|pharm)\b/.test(haystack)) {
    add("sple", 0.88, "Pharmacy terms were found in the upload.");
  }
  if (/\b(snle|nursing|nurse)\b/.test(haystack)) {
    add("snle", 0.88, "Nursing terms were found in the upload.");
  }
  if (/\b(slle|laboratory|lab|hematology|microbiology|biochemistry)\b/.test(haystack)) {
    add("slle", 0.84, "Laboratory terms were found in the upload.");
  }
  if (/\b(radiology|radiography|xray|x-ray|ct|mri|ultrasound)\b/.test(haystack)) {
    add("radiology", 0.84, "Radiology terms were found in the upload.");
  }
  if (/\b(family medicine|family|primary care|fm)\b/.test(haystack)) {
    add("family-medicine", 0.82, "Family medicine terms were found in the upload.");
  }
  if (/\b(smle|medicine|medical|physician|doctor|internal medicine|surgery)\b/.test(haystack)) {
    add("smle", 0.78, "Medical licensing terms were found in the upload.");
  }
  if (/\b(prometric|scfhs|saudi commission)\b/.test(haystack)) {
    add("saudi-prometric", 0.72, "Saudi Prometric or SCFHS terms were found.");
  }

  if (matches.length === 0 && isSaudiContext(input)) {
    add("smle", 0.42, "Saudi Arabia appears to match your current context.");
    add("saudi-prometric", 0.38, "Saudi Prometric is a common fallback for Saudi exam files.");
  }

  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

function isSaudiContext(input: { locale?: string; timeZone?: string }) {
  return (
    input.locale?.toLowerCase().includes("sa") ||
    input.timeZone?.toLowerCase() === "asia/riyadh"
  );
}

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function cleanReason(value: unknown) {
  if (typeof value !== "string") return "Suggested from your upload.";
  const reason = value.replace(/\s+/g, " ").trim();
  return reason.length > 140 ? `${reason.slice(0, 137)}...` : reason;
}
