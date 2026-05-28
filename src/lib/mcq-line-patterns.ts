/** Shared heuristics for detecting numbered MCQ stems and option lines in PDF text. */

export function normalizeLineForParsing(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .trim();
}

export function parseLeadingQuestionNumber(text: string): number | null {
  const normalized = normalizeLineForParsing(text);
  if (!normalized) return null;

  const patterns = [
    /^(\d{1,4})\s*[\.\):\-]/,
    /^(?:Question|QUESTION)\s+(\d{1,4})\b[\.\):\-]?/,
    /^[Qq]\.?\s*(\d{1,4})\b[\.\):\-]?/,
    /^[\(\[]\s*(\d{1,4})\s*[\)\]]/,
    /^No\.?\s*(\d{1,4})\b/i,
    /^(\d{1,4})\s+(?=[A-Za-z"'(])/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

export function parseStandaloneQuestionNumberLine(text: string): number | null {
  const normalized = normalizeLineForParsing(text);
  const match = normalized.match(/^(\d{1,4})$/);
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;
export type OptionLabel = (typeof OPTION_LABELS)[number];

export function isOptionLine(text: string, label?: OptionLabel): boolean {
  const normalized = normalizeLineForParsing(text);
  if (!normalized) return false;

  if (label) {
    return new RegExp(
      `^\\(?${label}[${label.toLowerCase()}]?\\)?[\\.\\):\\-]\\s*\\S`,
    ).test(normalized);
  }

  return /^[\(\[]?[A-Ea-e][\.\):\-]\s*\S/.test(normalized);
}

export function hasQuestionIntent(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  if (!normalized) return false;

  return (
    /\?/.test(normalized) ||
    /\b(?:which of the following|most appropriate|next step|best diagnosis|diagnosis|management|risk factor|what is|what are|how should|what to do|what will you|what would you|what should|first line|first-line|prevention|treatment|prophylaxis|screening|indicate[sd]?|recommend|advise)\b/i.test(
      normalized,
    ) ||
    // Recall document bullet-point question starters
    /^[•\-–]\s+(?:case|scenario|patient|a \d|an \d|\d+[\s-]year|elderly|young|pregnant|child|woman|man|girl|boy|nurse|worker|physician)/i.test(
      normalized,
    ) ||
    // Recall document: "what to give", "when to give", "how to manage" patterns
    /\b(?:when to|how to|what to give|what to use|what to start|level of prevention|type of prevention|classify|stage|target)\b/i.test(
      normalized,
    ) ||
    /(?:أي مما يلي|ما هو|ما هي|الأنسب|الأصح|الأكثر احتمالاً|الأكثر شيوعاً|ما العلاج|متى نعطي|كيف نتعامل)/.test(
      normalized,
    )
  );
}

export function hasAnswerKeySignal(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  return /^(?:answer|correct answer|his answer|ans\.?)\s*[:.\-]\s*[A-E]/i.test(
    normalized,
  ) || /(?:الإجابة|الإجابة الصحيحة)\s*[:：]?\s*/.test(normalized);
}

export function countQuestionCandidateSignals(text: string): number {
  const lines = text
    .split(/\r?\n|(?<=\.)\s+(?=\d{1,4}[\.\):\-]\s+)/)
    .map((line) => normalizeLineForParsing(line))
    .filter(Boolean);
  const lineRecords = lines.map((line) => ({ text: line }));

  let numberedStarts = 0;
  let optionSequenceStarts = 0;
  let intentSignals = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (
      parseLeadingQuestionNumber(line) !== null ||
      parseStandaloneQuestionNumberLine(line) !== null
    ) {
      numberedStarts += 1;
    }
    if (isOptionLine(line, "A") && hasMcqOptionSequence(lineRecords, index)) {
      optionSequenceStarts += 1;
    }
    if (hasQuestionIntent(line) && (hasAnswerKeySignal(line) || line.includes("?"))) {
      intentSignals += 1;
    }
  }

  return Math.max(numberedStarts, optionSequenceStarts, intentSignals);
}

export function hasMcqOptionSequence(lines: Array<{ text: string }>, startIndex: number): boolean {
  const labels = new Set<OptionLabel>();

  for (let index = startIndex; index < lines.length && index < startIndex + 24; index += 1) {
    for (const label of OPTION_LABELS) {
      if (isOptionLine(lines[index]!.text, label)) {
        labels.add(label);
      }
    }
  }

  return labels.has("A") && labels.has("B") && (labels.has("C") || labels.has("D"));
}

/** Lines that mark the end of the MCQ prompt (answer key / notes follow). */
export function isAnswerKeyLine(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  if (!normalized) return false;
  return /^(?:answer|correct answer|ans\.?)\s*[:.\-]/i.test(normalized);
}

export function isNotesOrExplanationLine(text: string): boolean {
  const normalized = normalizeLineForParsing(text);
  if (!normalized) return false;
  return /^(?:notes?|note|explanation|rationale|discussion|references?)\s*[:.\-]/i.test(
    normalized,
  );
}

export function isMcqBlockBoundaryLine(text: string): boolean {
  return isAnswerKeyLine(text) || isNotesOrExplanationLine(text);
}

export function findLastOptionLineIndex(
  lines: Array<{ text: string }>,
  startIndex: number,
  endIndex: number,
): number | null {
  let lastOption: number | null = null;

  for (let index = startIndex; index <= endIndex && index < lines.length; index += 1) {
    if (isMcqBlockBoundaryLine(lines[index]!.text)) break;
    if (isOptionLine(lines[index]!.text)) lastOption = index;
  }

  return lastOption;
}

/** Trim a question block so highlights stop before answer keys and notes. */
export function trimMcqBlockEndIndex(
  lines: Array<{ text: string }>,
  startIndex: number,
  endIndex: number,
): number {
  for (let index = startIndex; index <= endIndex && index < lines.length; index += 1) {
    if (isMcqBlockBoundaryLine(lines[index]!.text)) {
      return Math.max(startIndex, index - 1);
    }
  }

  const lastOption = findLastOptionLineIndex(lines, startIndex, endIndex);
  if (lastOption !== null) return lastOption;

  return endIndex;
}
