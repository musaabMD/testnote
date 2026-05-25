import {
  callOpenRouterJson,
  getOpenRouterMaxTokens,
  getOpenRouterModel,
} from "@/lib/openrouter-client";
import { trackedCallOpenRouterJson } from "@/lib/tracked-openrouter.server";
import type { TrackedOpenRouterContext } from "@/lib/tracked-openrouter.server";
import { cleanQuestionDisplayText, formatQuestionText, hasGrammarProblems } from "@/lib/question-text";

export type GrammarFixOption = {
  label: string;
  text: string;
};

export type GrammarFixItem = {
  questionNumber?: number;
  questionText: string;
  options: GrammarFixOption[];
};

export type GrammarFixResult = {
  questionText: string;
  options: GrammarFixOption[];
};

const GRAMMAR_SYSTEM_PROMPT =
  "You fix spelling typos and grammar in medical multiple-choice questions. Only correct spelling, spacing, and obvious extraction typos. Never rewrite, rephrase, summarize, or change the meaning of the question or options. Never invent new medical facts. Keep the same option labels and count. Do not replace placeholder options — leave them unchanged. Return only valid JSON.";

const FILL_CHOICES_SYSTEM_PROMPT =
  "You complete MCQ answer choices with plausible medical distractors. Keep real options unchanged. When fewer than four options exist, add new distractors until there are exactly four. Replace placeholder options like 'something else' with real distractors. Match the clinical topic of the question stem. Return only valid JSON.";

function buildGrammarUserPrompt(items: GrammarFixItem[]) {
  return [
    "Fix only spelling, grammar, and obvious extraction typos in each question and its answer choices.",
    "Do NOT rewrite the question stem. Do NOT change medical meaning. Do NOT add punctuation that changes intent.",
    "Keep medical abbreviations (MMR, IPV, chemo, etc.) and every option label exactly as provided.",
    "If an option text is a placeholder like 'something' or 'something else', leave it unchanged.",
    "Return JSON with this shape:",
    '{"items":[{"questionNumber":1,"questionText":"string","options":[{"label":"A","text":"string"}]}]}',
    "",
    JSON.stringify({ items }),
  ].join("\n");
}

function buildFillChoicesUserPrompt(item: GrammarFixItem) {
  return [
    "Complete this MCQ with exactly four answer choices labeled A through D.",
    "Keep every real option unchanged.",
    "Replace placeholder options and add missing distractors as needed.",
    "Return JSON:",
    '{"questionText":"string","options":[{"label":"A","text":"string"}]}',
    "",
    JSON.stringify({
      questionText: item.questionText,
      options: item.options,
      placeholders: item.options
        .filter((option) => isPlaceholderOption(option.text))
        .map((option) => option.label),
      targetChoiceCount: 4,
    }),
  ].join("\n");
}

function isPlaceholderOption(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  return (
    /^something(\s+else)?(\s*\d*)?$/.test(normalized) ||
    /^(option|choice|answer|item|other)(\s+\d*)?$/.test(normalized) ||
    /^(tbd|n\/a|unknown)$/.test(normalized)
  );
}

function questionChangedTooMuch(original: string, fixed: string): boolean {
  const a = original.trim().toLowerCase().replace(/\s+/g, " ");
  const b = fixed.trim().toLowerCase().replace(/\s+/g, " ");
  if (a === b) return false;
  const aWords = new Set(a.split(" ").filter(Boolean));
  const bWords = new Set(b.split(" ").filter(Boolean));
  let shared = 0;
  for (const word of aWords) {
    if (bWords.has(word)) shared += 1;
  }
  const overlap = aWords.size ? shared / aWords.size : 1;
  return overlap < 0.7;
}

function normalizeFixedItem(item: GrammarFixItem): GrammarFixResult {
  return {
    questionText: cleanFixedText(item.questionText),
    options: item.options.map((option) => ({
      label: option.label,
      text: cleanFixedText(option.text),
    })),
  };
}

/** Light cleanup after AI grammar fix — avoid re-running OCR casing heuristics. */
function cleanFixedText(text: string): string {
  const trimmed = cleanQuestionDisplayText(text);
  if (!trimmed) return "";
  if (hasGrammarProblems(trimmed)) {
    return formatQuestionText(trimmed);
  }
  return trimmed;
}

export async function fixGrammarItems(
  apiKey: string,
  items: GrammarFixItem[],
  tracking?: TrackedOpenRouterContext,
): Promise<GrammarFixResult[]> {
  if (!items.length) return [];

  const model = getOpenRouterModel("OPENROUTER_GRAMMAR_MODEL");
  const maxTokens = getOpenRouterMaxTokens("OPENROUTER_GRAMMAR_MAX_TOKENS", 2000);

  const parsed = tracking
    ? await trackedCallOpenRouterJson<{ items?: GrammarFixItem[] }>({
        ctx: tracking,
        apiKey,
        model,
        maxTokens,
        system: GRAMMAR_SYSTEM_PROMPT,
        user: buildGrammarUserPrompt(items),
        title: "DrNote Grammar Fix",
      })
    : await callOpenRouterJson<{ items?: GrammarFixItem[] }>({
        apiKey,
        model,
        maxTokens,
        system: GRAMMAR_SYSTEM_PROMPT,
        user: buildGrammarUserPrompt(items),
        title: "DrNote Grammar Fix",
      });

  const fixedItems = Array.isArray(parsed.items) ? parsed.items : [];
  return items.map((original, index) => {
    const match =
      fixedItems.find((item) => item.questionNumber === original.questionNumber) ??
      fixedItems[index];
    if (!match?.questionText || !Array.isArray(match.options)) {
      return normalizeFixedItem(original);
    }

    return normalizeFixedItem({
      questionNumber: original.questionNumber,
      questionText: questionChangedTooMuch(original.questionText, match.questionText)
        ? original.questionText
        : match.questionText,
      options: original.options.map((option) => {
        const fixedOption = match.options.find((item) => item.label === option.label);
        const nextText = fixedOption?.text ?? option.text;
        if (isPlaceholderOption(option.text)) return option;
        if (questionChangedTooMuch(option.text, nextText)) return option;
        return {
          label: option.label,
          text: nextText,
        };
      }),
    });
  });
}

export async function fixGrammarForMcqs<T extends GrammarFixItem>(
  apiKey: string,
  mcqs: T[],
  chunkSize = 12,
  tracking?: TrackedOpenRouterContext,
): Promise<T[]> {
  if (!mcqs.length) return mcqs;

  const updated = [...mcqs];

  for (let start = 0; start < mcqs.length; start += chunkSize) {
    const chunk = mcqs.slice(start, start + chunkSize);
    const payload = chunk.map((item, offset) => ({
      questionNumber: item.questionNumber ?? start + offset + 1,
      questionText: item.questionText,
      options: item.options,
    }));

    const fixed = await fixGrammarItems(apiKey, payload, tracking);

    fixed.forEach((item, index) => {
      const targetIndex = start + index;
      updated[targetIndex] = {
        ...updated[targetIndex]!,
        questionText: item.questionText,
        options: item.options,
      };
    });
  }

  return updated;
}

export async function fillPlaceholderOptions(
  apiKey: string,
  item: GrammarFixItem,
  tracking?: TrackedOpenRouterContext,
): Promise<GrammarFixResult> {
  const hasPlaceholders = item.options.some((option) => isPlaceholderOption(option.text));
  const needsMoreChoices = item.options.length < 4;
  if (!hasPlaceholders && !needsMoreChoices) {
    return normalizeFixedItem(item);
  }

  const model = getOpenRouterModel("OPENROUTER_GRAMMAR_MODEL");
  const maxTokens = getOpenRouterMaxTokens("OPENROUTER_GRAMMAR_MAX_TOKENS", 2000);

  const parsed = tracking
    ? await trackedCallOpenRouterJson<{
        questionText?: string;
        options?: GrammarFixOption[];
      }>({
        ctx: { ...tracking, feature: "grammar" },
        apiKey,
        model,
        maxTokens,
        system: FILL_CHOICES_SYSTEM_PROMPT,
        user: buildFillChoicesUserPrompt(item),
        title: "DrNote Fill Choices",
      })
    : await callOpenRouterJson<{
        questionText?: string;
        options?: GrammarFixOption[];
      }>({
        apiKey,
        model,
        maxTokens,
        system: FILL_CHOICES_SYSTEM_PROMPT,
        user: buildFillChoicesUserPrompt(item),
        title: "DrNote Fill Choices",
      });

  if (!Array.isArray(parsed.options)) {
    return normalizeFixedItem(item);
  }

  const mergedOptions = item.options.map((option) => {
    if (!isPlaceholderOption(option.text)) return option;
    const filled = parsed.options?.find((entry) => entry.label === option.label);
    const nextText = filled?.text?.trim() ?? option.text;
    return {
      label: option.label,
      text: isPlaceholderOption(nextText) ? option.text : nextText,
    };
  });

  const knownLabels = new Set(mergedOptions.map((option) => option.label.trim().toUpperCase()));
  for (const option of parsed.options ?? []) {
    const label = option.label?.trim();
    const text = option.text?.trim();
    if (!label || !text || isPlaceholderOption(text)) continue;
    const normalizedLabel = label.toUpperCase();
    if (knownLabels.has(normalizedLabel)) continue;
    mergedOptions.push({ label, text });
    knownLabels.add(normalizedLabel);
    if (mergedOptions.length >= 4) break;
  }

  return normalizeFixedItem({
    questionNumber: item.questionNumber,
    questionText: item.questionText,
    options: mergedOptions.slice(0, 4),
  });
}
