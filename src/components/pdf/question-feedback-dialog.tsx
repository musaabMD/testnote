"use client";

import {
  FEEDBACK_QUALITY_TAGS,
  saveQuestionFeedback,
  type QuestionFeedbackRecord,
} from "@/lib/quiz-sessions";
import { ThumbsDown, X } from "lucide-react";
import { useState } from "react";

export function QuestionFeedbackDialog({
  fileId,
  questionId,
  questionText,
  onClose,
}: {
  fileId: string;
  questionId: string;
  questionText: string;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [imageNotRelevant, setImageNotRelevant] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [saved, setSaved] = useState(false);

  function toggleTag(tag: string) {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }

  function submit() {
    const record: QuestionFeedbackRecord = {
      id: `${Date.now()}-${questionId}`,
      fileId,
      questionId,
      questionText,
      tags,
      imageNotRelevant,
      freeText: freeText.trim() || undefined,
      createdAt: Date.now(),
    };
    saveQuestionFeedback(record);
    setSaved(true);
    window.setTimeout(onClose, 900);
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full bg-red-50 text-red-500">
              <ThumbsDown className="size-4" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-950">Report issue</h2>
              <p className="text-xs text-slate-500">Help us improve question quality</p>
            </div>
          </div>
          <button
            aria-label="Close feedback"
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
          <input
            checked={imageNotRelevant}
            onChange={(event) => setImageNotRelevant(event.target.checked)}
            type="checkbox"
          />
          <span className="text-sm font-medium text-slate-700">
            Image does not belong to this question
          </span>
        </label>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Quality issues
          </p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_QUALITY_TAGS.map((tag) => (
              <button
                key={tag}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  tags.includes(tag)
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
                onClick={() => toggleTag(tag)}
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <textarea
          className="mt-4 h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
          onChange={(event) => setFreeText(event.target.value)}
          placeholder="Additional details (optional)"
          value={freeText}
        />

        <button
          className="mt-4 h-11 w-full rounded-full bg-zinc-950 text-sm font-bold text-white disabled:opacity-40"
          disabled={saved || (!tags.length && !imageNotRelevant && !freeText.trim())}
          onClick={submit}
          type="button"
        >
          {saved ? "Thanks — saved" : "Submit feedback"}
        </button>
      </div>
    </div>
  );
}
