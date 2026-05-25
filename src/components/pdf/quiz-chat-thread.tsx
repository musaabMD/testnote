"use client";

import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import type { FC } from "react";

export const QuizChatThread: FC = () => {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-1 flex-col bg-[#f7f7f8]">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        <ThreadPrimitive.Messages components={{ Message: QuizChatMessage }} />
      </ThreadPrimitive.Viewport>

      <div className="shrink-0 border-t border-black/5 bg-[#f7f7f8] px-4 pb-4 pt-3">
        <ComposerPrimitive.Root className="relative flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 shadow-sm">
          <ComposerPrimitive.Input
            aria-label="Message input"
            className="min-h-9 flex-1 resize-none bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            placeholder="Ask about this question…"
            rows={1}
          />
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send
              className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-800 disabled:opacity-40"
              type="button"
            >
              <ArrowUpIcon className="size-4" />
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel
              className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-950 text-white"
              type="button"
            >
              <SquareIcon className="size-3 fill-current" />
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
};

const QuizChatMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  if (role === "user") return <QuizUserMessage />;
  return <QuizAssistantMessage />;
};

const QuizAssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-6 text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
};

const QuizUserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-end">
      <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-zinc-950 px-4 py-3 text-sm leading-6 text-white">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};
