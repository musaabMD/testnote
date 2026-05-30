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
      className="fixed inset-0 z-[120] flex justify-end bg-slate-950/35 backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-[28rem] flex-col border-l border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Study mode
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Quiz Settings</h2>
          </div>
          <button
            aria-label="Close settings"
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <SettingsGroup title="Timer">
            {[
              { value: true, label: "Timer on" },
              { value: false, label: "Timer off" },
            ].map(({ value, label }) => (
              <SettingsRow
                key={label}
                label={label}
                selected={local.timerEnabled === value}
                onClick={() =>
                  setLocal((current) => ({
                    ...current,
                    timerEnabled: value,
                  }))
                }
              />
            ))}
          </SettingsGroup>

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

        <div className="grid grid-cols-[0.42fr_1fr] gap-3 border-t border-slate-100 bg-white px-6 py-5">
          <button
            className="h-11 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-lg bg-zinc-950 text-sm font-bold text-white shadow-lg shadow-slate-950/10 transition hover:bg-zinc-800"
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
    <section>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.03]">
        {children}
      </div>
    </section>
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
      aria-pressed={selected}
      className={`flex min-h-12 w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 ${
        selected
          ? "bg-blue-50/70 text-slate-950"
          : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      }`}
      onClick={onClick}
      type="button"
    >
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full border ${
          selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
        }`}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <span className={`min-w-0 flex-1 text-sm ${selected ? "font-bold" : "font-medium"}`}>
        {label}
      </span>
    </button>
  );
}
