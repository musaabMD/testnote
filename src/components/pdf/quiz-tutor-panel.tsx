"use client";

import type { ChatMessage } from "@/components/pdf/pdf-view-modals";
import { getQuestionText } from "@/components/pdf/pdf-study-panel";
import type { PdfMcq } from "@/lib/pdf-mcqs";
import { buildQuizAssistantInstructions } from "@/lib/quiz-tutor-prompt";
import { streamTutorReply } from "@/lib/tutor-chat-client";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PanelLayout = "sidebar" | "sheet";
type PanelSize = "peek" | "expanded" | "fullscreen";

export function QuizTutorPanel({
  question,
  chatHistory,
  onAddMessage,
  isBookmarked,
  onToggleBookmark,
  layout = "sidebar",
}: {
  question: PdfMcq;
  chatHistory: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  layout?: PanelLayout;
}) {
  const [draft, setDraft] = useState("");
  const [size, setSize] = useState<PanelSize>(layout === "sheet" ? "peek" : "expanded");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, question, size, streamingReply, isLoading]);

  function handleSend() {
    const text = draft.trim();
    if (!text || isLoading) return;

    const nextMessages: ChatMessage[] = [...chatHistory, { role: "user", text }];
    onAddMessage({ role: "user", text });
    setDraft("");
    setStreamingReply("");
    if (layout === "sheet") setSize("expanded");
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void streamTutorReply({
      system: buildQuizAssistantInstructions(question),
      messages: nextMessages,
      signal: controller.signal,
      onUpdate: setStreamingReply,
    })
      .then((final) => {
        onAddMessage({ role: "assistant", text: final });
        setStreamingReply("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : "Could not reach the AI tutor. Try again.";
        onAddMessage({ role: "assistant", text: message });
        setStreamingReply("");
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsLoading(false);
      });
  }

  function toggleSheetSize() {
    setSize((current) => {
      if (current === "peek") return "expanded";
      if (current === "expanded") return "peek";
      return "expanded";
    });
  }

  function toggleFullscreen() {
    setSize((current) => (current === "fullscreen" ? "expanded" : "fullscreen"));
  }

  const lastAssistant = [...chatHistory].reverse().find((msg) => msg.role === "assistant");

  const shellClass =
    size === "fullscreen"
      ? "fixed inset-3 z-[80] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-4"
      : layout === "sheet"
        ? size === "peek"
          ? "fixed inset-x-0 bottom-0 z-[70] flex max-h-[42vh] flex-col overflow-hidden rounded-t-[1.25rem] border border-b-0 border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.12)]"
          : "fixed inset-x-0 bottom-0 z-[70] flex max-h-[min(85vh,720px)] flex-col overflow-hidden rounded-t-[1.25rem] border border-b-0 border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.12)]"
        : "sticky top-[4.5rem] flex h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl";

  return (
    <>
      {size === "fullscreen" ? (
        <button
          aria-label="Close tutor"
          className="fixed inset-0 z-[75] bg-slate-950/35"
          onClick={() => setSize(layout === "sheet" ? "expanded" : "expanded")}
          type="button"
        />
      ) : null}

      <aside className={shellClass}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-950 text-white">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">AI Tutor</p>
              <p className="truncate text-xs text-slate-500">
                Question {question.questionNumber ?? ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark question"}
              className={`grid size-8 place-items-center rounded-lg transition ${
                isBookmarked ? "bg-amber-100 text-amber-600" : "text-slate-400 hover:bg-slate-100"
              }`}
              onClick={onToggleBookmark}
              type="button"
            >
              <Bookmark className="size-4" fill={isBookmarked ? "currentColor" : "none"} />
            </button>
            {layout === "sheet" ? (
              <button
                aria-label={size === "peek" ? "Expand tutor" : "Collapse tutor"}
                className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100"
                onClick={toggleSheetSize}
                type="button"
              >
                {size === "peek" ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
            ) : null}
            <button
              aria-label={size === "fullscreen" ? "Exit fullscreen" : "Expand tutor"}
              className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100"
              onClick={toggleFullscreen}
              type="button"
            >
              {size === "fullscreen" ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </button>
          </div>
        </div>

        {size !== "peek" ? (
          <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="line-clamp-2 text-xs font-medium leading-5 text-slate-600">
              {getQuestionText(question)}
            </p>
          </div>
        ) : (
          <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <p className="line-clamp-1 text-xs font-medium text-slate-600">
              {lastAssistant?.text ?? "Ask why each choice is correct or incorrect."}
            </p>
          </div>
        )}

        {size !== "peek" ? (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {chatHistory.length || streamingReply ? (
                <>
                  {chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800">
                          {msg.text}
                        </div>
                      ) : (
                        <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-zinc-950 px-4 py-3 text-sm leading-6 text-white">
                          {msg.text}
                        </div>
                      )}
                    </div>
                  ))}
                  {streamingReply || (isLoading && !streamingReply) ? (
                    <div className="flex justify-start">
                      <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800">
                        {streamingReply || "Thinking…"}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Ask why each choice is correct or incorrect, or request a deeper explanation.
                </p>
              )}
            </div>
          </div>
        ) : null}

        <div className="shrink-0 border-t border-slate-100 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <input
              className="h-10 min-w-0 flex-1 rounded-xl bg-slate-100 px-3.5 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => {
                if (layout === "sheet" && size === "peek") setSize("expanded");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Continue chat with AI…"
              value={draft}
            />
            <button
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-950 text-white disabled:opacity-40"
              disabled={!draft.trim() || isLoading}
              onClick={handleSend}
              type="button"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
