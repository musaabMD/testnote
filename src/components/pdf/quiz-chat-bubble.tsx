"use client";

import { QuizChatThread } from "@/components/pdf/quiz-chat-thread";
import { cn } from "@/lib/utils";
import { AssistantModalPrimitive } from "@assistant-ui/react";
import { ChevronDown, MessageSquare, Sparkles, X } from "lucide-react";
import { forwardRef, type FC } from "react";

type QuizChatBubbleProps = {
  title?: string;
  subtitle?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const QuizChatBubble: FC<QuizChatBubbleProps> = ({
  title = "DrNote Tutor",
  subtitle,
  open,
  onOpenChange,
}) => {
  return (
    <AssistantModalPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AssistantModalPrimitive.Anchor className="fixed end-4 bottom-4 z-[60]">
        <AssistantModalPrimitive.Trigger asChild>
          <ChatLauncherButton />
        </AssistantModalPrimitive.Trigger>
      </AssistantModalPrimitive.Anchor>

      <AssistantModalPrimitive.Content
        align="end"
        side="top"
        sideOffset={12}
        className={cn(
          "z-[70] flex h-[min(560px,calc(100dvh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.25rem] border-0 bg-transparent p-0 shadow-[0_12px_48px_rgba(0,0,0,0.18)] outline-none",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2",
          "data-[state=closed]:animate-out data-[state=open]:animate-in",
        )}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.25rem] bg-[#f7f7f8]">
          <header className="flex shrink-0 items-center justify-between bg-zinc-950 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/10">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{title}</p>
                {subtitle ? (
                  <p className="truncate text-xs text-white/60">{subtitle}</p>
                ) : null}
              </div>
            </div>
            <AssistantModalPrimitive.Trigger asChild>
              <button
                aria-label="Close chat"
                className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                type="button"
              >
                <X className="size-4" />
              </button>
            </AssistantModalPrimitive.Trigger>
          </header>

          <QuizChatThread />
        </div>
      </AssistantModalPrimitive.Content>
    </AssistantModalPrimitive.Root>
  );
};

type ChatLauncherButtonProps = { "data-state"?: "open" | "closed" };

const ChatLauncherButton = forwardRef<HTMLButtonElement, ChatLauncherButtonProps>(
  ({ "data-state": state, ...rest }, ref) => {
    const isOpen = state === "open";

    return (
      <button
        {...rest}
        ref={ref}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        className="relative grid size-14 place-items-center rounded-full bg-zinc-950 text-white shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition hover:scale-105 active:scale-95"
        type="button"
      >
        {isOpen ? (
          <ChevronDown className="size-6" />
        ) : (
          <span className="relative grid place-items-center">
            <MessageSquare className="size-6" strokeWidth={1.75} />
            <Sparkles className="absolute -top-1 -right-1 size-3.5 text-white/90" />
          </span>
        )}
      </button>
    );
  },
);

ChatLauncherButton.displayName = "ChatLauncherButton";
