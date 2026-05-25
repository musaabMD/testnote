"use client";

import {
  EXTRACTION_MODE_LABELS,
  type PdfQuizSettings,
} from "@/lib/quiz-settings";
import { Check, X } from "lucide-react";
import { useState } from "react";

export function QuizSettingsDrawer({
  settings,
  onClose,
  onSave,
}: {
  settings: PdfQuizSettings;
  onClose: () => void;
  onSave: (settings: PdfQuizSettings) => void;
}) {
  const [local, setLocal] = useState(settings);

  return (
    <div
      className="fixed inset-0 z-[120] flex justify-end bg-slate-950/25"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-950">Quiz Settings</h2>
          <button
            aria-label="Close settings"
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="mb-4 text-sm text-slate-500">
            Default settings for quiz and exam modes.
          </p>

          <SettingsGroup title="Answer display">
            {[
              ["asIGo", "Show answers as I go"],
              ["atEnd", "Show answers at the end"],
            ].map(([value, label]) => (
              <SettingsRow
                key={value}
                label={label}
                selected={local.showAnswers === value}
                onClick={() =>
                  setLocal((current) => ({
                    ...current,
                    showAnswers: value as PdfQuizSettings["showAnswers"],
                  }))
                }
              />
            ))}
          </SettingsGroup>

          <SettingsGroup title="Submit mode">
            {[
              ["manual", 'Manual submit ("Check answer" button)'],
              ["auto", "Automatic submit (click answer)"],
            ].map(([value, label]) => (
              <SettingsRow
                key={value}
                label={label}
                selected={local.submitMode === value}
                onClick={() =>
                  setLocal((current) => ({
                    ...current,
                    submitMode: value as PdfQuizSettings["submitMode"],
                  }))
                }
              />
            ))}
          </SettingsGroup>

          <SettingsGroup title="Extraction mode">
            {(Object.keys(EXTRACTION_MODE_LABELS) as Array<keyof typeof EXTRACTION_MODE_LABELS>).map(
              (value) => (
                <SettingsRow
                  key={value}
                  label={EXTRACTION_MODE_LABELS[value]}
                  selected={local.extractionMode === value}
                  onClick={() => setLocal((current) => ({ ...current, extractionMode: value }))}
                />
              ),
            )}
          </SettingsGroup>

          <SettingsGroup title="Editing">
            <SettingsRow
              label="Allow editing question and choices"
              selected={local.allowEdit}
              onClick={() =>
                setLocal((current) => ({ ...current, allowEdit: !current.allowEdit }))
              }
            />
          </SettingsGroup>
        </div>

        <div className="border-t border-slate-100 p-5">
          <button
            className="h-11 w-full rounded-full bg-zinc-950 text-sm font-bold text-white"
            onClick={() => {
              onSave(local);
              onClose();
            }}
            type="button"
          >
            Save settings
          </button>
        </div>
      </aside>
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-200">{children}</div>
    </div>
  );
}

function SettingsRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-b-0"
      onClick={onClick}
      type="button"
    >
      <span className={`text-sm ${selected ? "font-bold text-slate-950" : "text-slate-500"}`}>
        {label}
      </span>
      {selected ? <Check className="size-4 text-blue-600" /> : null}
    </button>
  );
}
