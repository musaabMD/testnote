import type { PdfMcq } from "@/lib/pdf-mcqs";

/** Raw question text as extracted from the file, before formatting. */
export function getRawQuestionText(question: PdfMcq): string {
  return (question.questionText ?? question.question ?? "").trim();
}

/** Question text after auto-formatting or manual edits. */
export function getResolvedQuestionText(
  question: PdfMcq,
  edit?: { questionText?: string },
): string {
  const raw = getRawQuestionText(question);
  return (edit?.questionText ?? formatQuestionText(raw)).trim();
}

/** Whether the displayed question differs from the raw extraction. */
export function hasFormattedQuestionVariant(
  question: PdfMcq,
  edit?: { questionText?: string },
): boolean {
  return getRawQuestionText(question) !== getResolvedQuestionText(question, edit);
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const ARABIC_OPTION_LABELS = ["أ", "ب", "ج", "د", "ه", "و"] as const;

const LATIN_TO_ARABIC_LABEL: Record<string, string> = {
  a: "أ",
  b: "ب",
  c: "ج",
  d: "د",
  e: "ه",
  f: "و",
};

const ARABIC_TO_LATIN_LABEL: Record<string, string> = {
  أ: "a",
  ا: "a",
  ب: "b",
  ج: "c",
  د: "d",
  ه: "e",
  و: "f",
};

/** Whether the text is primarily Arabic / RTL study content. */
export function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text);
}

export function isRtlContent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const arabicChars = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) ?? []).length;
  const latinChars = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  return arabicChars > 0 && arabicChars >= latinChars;
}

export function getTextDirection(text: string): "rtl" | "ltr" {
  return isRtlContent(text) ? "rtl" : "ltr";
}

export function getDisplayOptionLabel(label: string, index: number, rtl: boolean): string {
  if (!rtl) return label;

  const normalized = label.trim();
  const latin = normalized.toLowerCase();
  if (LATIN_TO_ARABIC_LABEL[latin]) {
    return LATIN_TO_ARABIC_LABEL[latin]!;
  }
  if (containsArabicScript(normalized)) {
    return normalized;
  }

  return ARABIC_OPTION_LABELS[index] ?? normalized;
}

export function normalizeAnswerLabel(label: string): string {
  const trimmed = label.trim().toLowerCase();
  return ARABIC_TO_LATIN_LABEL[trimmed] ?? trimmed;
}

/** Normalize OCR / extraction casing into readable sentence case. */
export function formatQuestionText(text: string): string {
  const trimmed = cleanQuestionDisplayText(text);
  if (!trimmed) return "";
  if (isRtlContent(trimmed)) return trimmed;

  if (!needsTextFormatting(trimmed)) {
    return trimmed;
  }

  const words = trimmed.split(/\s+/).map(formatWord);
  const lowered = words.join(" ");

  return lowered.replace(/(^\w|[.!?]\s+\w)/g, (match) => match.toUpperCase());
}

/** Strip OCR placeholders, markdown artifacts, and inline image descriptions. */
export function cleanQuestionDisplayText(text: string): string {
  return text
    .replace(/\{[^}]{0,240}\}/g, " ")
    .replace(/\(\s*see (?:image|picture|lab)[^)]*\)/gi, " ")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clean notes/explanations for display (no markdown headers). */
export function cleanExplanationText(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")
    .replace(/^\s*answer\s*:\s*/gim, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatOptionText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (isRtlContent(trimmed)) return trimmed;
  if (!needsTextFormatting(trimmed)) return trimmed;
  return trimmed
    .split(/\s+/)
    .map(formatWord)
    .join(" ");
}

/** Detect OCR placeholder options that should be replaced with real choices. */
export function isPlaceholderOptionText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return true;
  if (/^something(\s+else)?(\s*\d*)?$/.test(normalized)) return true;
  if (/^(option|choice|answer|item)\s*[a-d0-9]*$/.test(normalized)) return true;
  if (/^(tbd|n\/a|unknown|\?+|\.+|xxx+)$/.test(normalized)) return true;
  if (/^other(\s+\d*)?$/.test(normalized)) return true;
  return false;
}

/** Whether an option looks like a real answer choice. */
export function isUsableOptionText(text: string): boolean {
  return !isPlaceholderOptionText(text);
}

/** Detect obvious grammar / OCR problems in raw question text. */
export function hasGrammarProblems(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (isRtlContent(trimmed)) return false;
  if (/\{[^}]+\}/.test(trimmed)) return true;
  if (/\s{2,}/.test(trimmed)) return true;
  if (hasAlternatingCase(trimmed)) return true;
  if (/^[a-z]/.test(trimmed)) return true;
  if (/\b([a-z]+)([A-Z][a-z]+)\b/.test(trimmed)) return true;
  return false;
}

function needsTextFormatting(text: string): boolean {
  if (hasAlternatingCase(text)) return true;

  const words = text.split(/\s+/).filter((word) => word.length > 2);
  if (!words.length) return false;

  let erraticWords = 0;
  for (const word of words) {
    const inner = word.slice(1);
    const innerUpper = (inner.match(/[A-Z]/g) ?? []).length;
    if (innerUpper > 0 && innerUpper / inner.length >= 0.25) {
      erraticWords += 1;
    }
  }

  if (erraticWords >= Math.max(2, Math.ceil(words.length * 0.2))) return true;

  // Title Case on long questions reads unnaturally for study content.
  const titleCaseWords = words.filter(
    (word) => /^[A-Z][a-z]+/.test(word) && !isAcronym(word),
  ).length;
  return titleCaseWords >= Math.ceil(words.length * 0.75) && words.length >= 6;
}

function hasAlternatingCase(text: string): boolean {
  let alternations = 0;
  let letters = 0;

  for (const word of text.split(/\s+/)) {
    for (let index = 1; index < word.length; index += 1) {
      if (!/[a-zA-Z]/.test(word[index]!) || !/[a-zA-Z]/.test(word[index - 1]!)) continue;
      letters += 1;
      const currentUpper = word[index] === word[index]!.toUpperCase();
      const previousUpper = word[index - 1] === word[index - 1]!.toUpperCase();
      if (currentUpper !== previousUpper) alternations += 1;
    }
  }

  return letters > 6 && alternations / letters > 0.35;
}

function formatWord(word: string): string {
  if (isAcronym(word)) return word;
  if (/^[A-Z]\d+$/.test(word)) return word;
  if (/^\d+[A-Za-z]?$/.test(word)) return word;
  return word.toLowerCase();
}

function isAcronym(word: string): boolean {
  const stripped = word.replace(/[^A-Za-z0-9]/g, "");
  return stripped.length >= 2 && stripped === stripped.toUpperCase();
}
