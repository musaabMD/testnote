"use client";

import { Sparkles, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

const AI_SUGGESTIONS = [
  "Chemistry",
  "Biology",
  "Organic chemistry",
  "Physiology",
  "Pathology",
  "Pharmacology",
];

type SubjectTagsFieldProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  onSuggest?: () => void;
  suggesting?: boolean;
};

export function SubjectTagsField({
  tags,
  onChange,
  onSuggest,
  suggesting = false,
}: SubjectTagsFieldProps) {
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const exists = tags.some(
      (tag) => tag.toLowerCase() === value.toLowerCase(),
    );
    if (exists) {
      setDraft("");
      return;
    }
    onChange([...tags, value]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((item) => item !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-500">Subjects</span>
        {onSuggest ? (
          <button
            type="button"
            disabled={suggesting}
            onClick={onSuggest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
          >
            <Sparkles className="size-3.5" aria-hidden />
            {suggesting ? "Suggesting…" : "Suggest with AI"}
          </button>
        ) : null}
      </div>

      <div className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-2 py-2 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pr-1.5 pl-2.5 text-xs font-semibold text-slate-700"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="grid size-5 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                onClick={() => removeTag(tag)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            placeholder={tags.length ? "Add another…" : "Type a subject, press Enter"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => addTag(draft)}
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        AI can suggest topics from your uploads — remove or add tags anytime.
      </p>

      {!tags.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AI_SUGGESTIONS.slice(0, 4).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-dashed border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
              onClick={() => addTag(suggestion)}
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function suggestSubjectsFromSources(
  fileNames: string[],
  textSnippets: string[],
): string[] {
  const blob = `${fileNames.join(" ")} ${textSnippets.join(" ")}`.toLowerCase();
  const pool = [
    ...AI_SUGGESTIONS,
    "Economics",
    "Anatomy",
    "Biochemistry",
    "Microbiology",
    "Genetics",
    "Statistics",
  ];
  const matched = pool.filter((subject) => {
    const token = subject.toLowerCase().split(" ")[0];
    return blob.includes(token);
  });
  if (matched.length >= 2) return matched.slice(0, 5);
  return AI_SUGGESTIONS.slice(0, 3);
}
