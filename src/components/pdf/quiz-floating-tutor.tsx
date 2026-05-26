"use client";

import { getNotes } from "@/components/pdf/pdf-study-panel";
import type { ChatMessage } from "@/components/pdf/pdf-view-modals";
import {
  buildQuizAssistantInstructions,
  buildQuizWelcomeMessage,
  hasUsableExplanationNotes,
  QUIZ_AUTO_EXPLAIN_PROMPT,
} from "@/lib/quiz-tutor-prompt";
import type { PdfMcq } from "@/lib/pdf-mcqs";
import { cleanExplanationText } from "@/lib/question-text";
import { formatUsageErrorForChat } from "@/lib/quota-errors";
import { streamTutorReply } from "@/lib/tutor-chat-client";
import { ChevronDown, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function QuizFloatingTutor({
  question,
}: {
  question: PdfMcq;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingReply, setStreamingReply] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const intro = buildQuizWelcomeMessage(question);
    return intro ? [{ role: "assistant", text: intro }] : [];
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoExplainRef = useRef(false);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingReply, isLoading, open]);

  const sendPrompt = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(nextMessages);
    setDraft("");
    setStreamingReply("");
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const final = await streamTutorReply({
        system: buildQuizAssistantInstructions(question),
        messages: nextMessages,
        signal: controller.signal,
        onUpdate: setStreamingReply,
      });
      setMessages((current) => [...current, { role: "assistant", text: final }]);
      setStreamingReply("");
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = formatUsageErrorForChat(
        error instanceof Error ? error.message : "Could not reach the AI tutor.",
      );
      setMessages((current) => [...current, { role: "assistant", text: message }]);
      setStreamingReply("");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsLoading(false);
    }
  }, [isLoading, messages, question]);

  useEffect(() => {
    if (!open || autoExplainRef.current) return;

    const notes = getNotes(question).map(cleanExplanationText).filter(Boolean);
    if (hasUsableExplanationNotes(notes)) return;

    autoExplainRef.current = true;
    const timeout = window.setTimeout(() => {
      void sendPrompt(QUIZ_AUTO_EXPLAIN_PROMPT);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [open, question, sendPrompt]);

  const subtitle = question.questionNumber
    ? `Question ${question.questionNumber}`
    : "Study tutor";

  return (
    <>
      {open ? (
        <div
          className="fixed inset-x-0 bottom-0 top-16 z-[60] bg-black/20 sm:inset-auto sm:bottom-24 sm:right-4 sm:top-auto sm:h-[min(560px,calc(100dvh-7rem))] sm:w-[min(400px,calc(100vw-2rem))] sm:bg-transparent"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <div className="fixed end-4 bottom-4 z-[70] flex flex-col items-end gap-3">
        {open ? (
          <div
            className="flex h-[min(560px,calc(100dvh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.25rem] bg-[#f7f7f8] shadow-[0_12px_48px_rgba(0,0,0,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between bg-zinc-950 px-4 py-3 text-white">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
                  <Sparkles className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">DrNote Tutor</p>
                  <p className="truncate text-xs text-white/60">{subtitle}</p>
                </div>
              </div>
              <button
                aria-label="Close chat"
                className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                {messages.map((msg, index) => (
                  <div
                    key={`${index}-${msg.role}`}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm ring-1 ring-black/5">
                        {msg.text}
                      </div>
                    ) : (
                      <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-zinc-950 px-4 py-3 text-sm leading-6 text-white">
                        {msg.text}
                      </div>
                    )}
                  </div>
                ))}
                {streamingReply || (isLoading && !streamingReply) ? (
                  <div className="flex justify-start">
                    <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm ring-1 ring-black/5">
                      {streamingReply || "Thinking…"}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-black/5 px-4 pb-4 pt-3">
              <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 shadow-sm">
                <input
                  className="min-h-9 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  disabled={isLoading}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendPrompt(draft);
                    }
                  }}
                  placeholder="Ask about this question…"
                  value={draft}
                />
                <button
                  aria-label="Send message"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:opacity-40"
                  disabled={!draft.trim() || isLoading}
                  onClick={() => void sendPrompt(draft)}
                  type="button"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <button
          aria-label={open ? "Close tutor" : "Open tutor"}
          className="grid size-14 place-items-center rounded-full bg-zinc-950 text-white shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition hover:scale-105 active:scale-95"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? (
            <ChevronDown className="size-6" />
          ) : (
            <span className="relative grid place-items-center">
              <MessageSquare className="size-6" strokeWidth={1.75} />
              <Sparkles className="absolute -top-1 -right-1 size-3.5 text-white/90" />
            </span>
          )}
        </button>
      </div>
    </>
  );
}
