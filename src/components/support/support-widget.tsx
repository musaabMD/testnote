"use client";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Bot,
  Bug,
  ChevronDown,
  GraduationCap,
  ImageIcon,
  Lightbulb,
  MessageSquare,
  Paperclip,
  PenLine,
  Send,
  Sparkles,
  Star,
  ThumbsUp,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

type SupportCategory =
  | "message"
  | "bug"
  | "feedback"
  | "review"
  | "suggest_exam"
  | "suggest_feature"
  | "rating";

type LocalAttachment = {
  file: File;
  previewUrl: string;
};

type UploadedAttachment = {
  storageId: Id<"_storage">;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

const storageKey = "drnote:support-thread-id";
const maxAttachments = 3;
const maxAttachmentBytes = 8 * 1024 * 1024;

const categories: Array<{
  value: SupportCategory;
  label: string;
  placeholder: string;
  icon: typeof MessageSquare;
}> = [
  {
    value: "message",
    label: "Ask a question",
    placeholder: "Send us a message...",
    icon: MessageSquare,
  },
  {
    value: "bug",
    label: "Report issue",
    placeholder: "What happened, and what were you trying to do?",
    icon: Bug,
  },
  {
    value: "feedback",
    label: "Leave feedback",
    placeholder: "What should we improve?",
    icon: PenLine,
  },
  {
    value: "suggest_exam",
    label: "Suggest exam",
    placeholder: "Exam name, country, school, or specialty...",
    icon: GraduationCap,
  },
  {
    value: "suggest_feature",
    label: "Suggest feature",
    placeholder: "What workflow should DrNote improve?",
    icon: Lightbulb,
  },
  {
    value: "review",
    label: "Write review",
    placeholder: "Share your review...",
    icon: Star,
  },
  {
    value: "rating",
    label: "Rate DrNote",
    placeholder: "Add a short note with your DrNote rating...",
    icon: ThumbsUp,
  },
];

export function SupportWidget({
  contactEmail,
  userName,
}: {
  contactEmail?: string;
  userName?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<Id<"supportThreads"> | null>(null);
  const [category, setCategory] = useState<SupportCategory>("message");
  const [selectedDetail, setSelectedDetail] = useState<SupportCategory | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState(contactEmail ?? "");
  const [rating, setRating] = useState(0);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAssistant, setPendingAssistant] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const attachmentsRef = useRef<LocalAttachment[]>([]);

  const createThread = useMutation(api.support.createThread);
  const addUserMessage = useMutation(api.support.addUserMessage);
  const appendAssistantMessage = useMutation(api.support.appendAssistantMessage);
  const generateAttachmentUploadUrl = useMutation(
    api.support.generateAttachmentUploadUrl,
  );
  const threadResult = useQuery(
    api.support.getThreadMessages,
    threadId ? { threadId } : "skip",
  );

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setThreadId(saved as Id<"supportThreads">);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (threadResult === null) {
      window.localStorage.removeItem(storageKey);
      const cleanup = window.setTimeout(() => setThreadId(null), 0);
      return () => window.clearTimeout(cleanup);
    }
  }, [threadResult]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [threadResult?.messages.length, pendingAssistant, open]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) =>
        window.URL.revokeObjectURL(attachment.previewUrl),
      );
    };
  }, []);

  function pickCategory(nextCategory: SupportCategory) {
    const next = categories.find((item) => item.value === nextCategory) ?? categories[0];
    setCategory(next.value);
    setSelectedDetail(next.value);
    if (next.value === "rating" || next.value === "review") {
      setRating((current) => current || 5);
    } else {
      setRating(0);
    }
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function resetThread() {
    window.localStorage.removeItem(storageKey);
    setThreadId(null);
    setSelectedDetail(null);
    setDraft("");
    setRating(0);
    setError("");
    setPendingAssistant(false);
  }

  function goBack() {
    if (threadId) {
      resetThread();
      return;
    }
    setSelectedDetail(null);
    setDraft("");
    setRating(0);
    setError("");
  }

  function onSelectImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const nextAttachments = files
      .filter((file) => file.type.startsWith("image/"))
      .filter((file) => file.size <= maxAttachmentBytes)
      .slice(0, Math.max(0, maxAttachments - attachments.length))
      .map((file) => ({
        file,
        previewUrl: window.URL.createObjectURL(file),
      }));

    if (nextAttachments.length < files.length) {
      setError("Only images up to 8 MB are supported.");
    } else {
      setError("");
    }

    setAttachments((current) => [...current, ...nextAttachments]);
  }

  function removeAttachment(index: number) {
    setAttachments((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      if (removed) window.URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  async function uploadAttachments() {
    const uploaded: UploadedAttachment[] = [];
    for (const attachment of attachments) {
      const uploadUrl = await generateAttachmentUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": attachment.file.type },
        body: attachment.file,
      });
      if (!response.ok) throw new Error("Image upload failed.");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      uploaded.push({
        storageId,
        name: attachment.file.name,
        mimeType: attachment.file.type,
        sizeBytes: attachment.file.size,
      });
    }
    return uploaded;
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    const messageRating = isRatingCategory(category) ? rating : 0;
    if ((!message && attachments.length === 0 && messageRating === 0) || submitting) {
      return;
    }

    const history =
      threadResult?.messages.map((item) => ({
        role: item.role,
        body: item.body,
      })) ?? [];
    const localAttachments = attachments;
    const localRating = messageRating;
    const resolvedEmail = email || extractEmail(message) || contactEmail || "";
    if (resolvedEmail && resolvedEmail !== email) {
      setEmail(resolvedEmail);
    }

    setSubmitting(true);
    setPendingAssistant(true);
    setDraft("");
    setRating(0);
    setAttachments([]);
    setError("");

    try {
      const uploadedAttachments = await uploadAttachments();
      let activeThreadId = threadId;

      if (activeThreadId) {
        await addUserMessage({
          threadId: activeThreadId,
          message,
          email: resolvedEmail || undefined,
          category,
          rating: messageRating || undefined,
          attachments: uploadedAttachments,
        });
      } else {
        activeThreadId = await createThread({
          category,
          message,
          email: resolvedEmail || undefined,
          rating: messageRating || undefined,
          attachments: uploadedAttachments,
          pathname,
          pageUrl: window.location.href,
          userAgent: window.navigator.userAgent,
        });
        window.localStorage.setItem(storageKey, activeThreadId);
        setThreadId(activeThreadId);
      }

      const reply = await getAssistantReply({
        category,
        message,
        rating: messageRating || undefined,
        hasContactEmail: Boolean(resolvedEmail),
        userName,
        history,
        attachments: uploadedAttachments,
      });
      await appendAssistantMessage({
        threadId: activeThreadId,
        message: reply,
      });
    } catch {
      setError("Message could not be sent. Try again.");
      setDraft(message);
      setRating(localRating);
      setAttachments(localAttachments);
    } finally {
      setSubmitting(false);
      setPendingAssistant(false);
    }
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={open ? "Close support" : "Open support"}
        className="fixed end-5 bottom-5 z-[80] grid size-14 place-items-center rounded-full bg-black text-white shadow-[0_14px_38px_rgba(0,0,0,0.28)] transition hover:scale-105 active:scale-95"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {open ? (
          <ChevronDown className="size-7" />
        ) : (
          <span className="relative grid place-items-center">
            <MessageSquare className="size-7 fill-white" strokeWidth={1.8} />
            <Sparkles className="absolute -right-1 -top-1 size-4 fill-white" />
          </span>
        )}
      </button>

      {open ? (
        <section
          aria-label="DrNote support"
          role="dialog"
          className={cn(
            "fixed end-5 bottom-24 z-[90] flex h-[min(720px,calc(100dvh-7rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-white text-zinc-950 shadow-[0_24px_80px_rgba(15,23,42,0.22)] outline-none",
            "animate-in fade-in-0 slide-in-from-bottom-2 zoom-in-95 duration-150",
          )}
        >
          <SupportHeader
            canGoBack={Boolean(threadId || selectedDetail)}
            onBack={goBack}
            onClose={() => setOpen(false)}
          />

          {!threadId && !selectedDetail ? (
            <HomePanel
              activeCategory={category}
              onPickCategory={pickCategory}
              userName={userName}
            />
          ) : !threadId ? (
            <DetailPanel
              activeCategory={category}
              draft={draft}
              error={error}
              onAttachmentClick={() => fileInputRef.current?.click()}
              onDraftChange={setDraft}
              onRemoveAttachment={removeAttachment}
              onRatingChange={setRating}
              onSubmit={submitMessage}
              rating={rating}
              selectedAttachments={attachments}
              submitting={submitting || pendingAssistant}
              textareaRef={textareaRef}
            />
          ) : (
            <ChatPanel
              activeCategory={category}
              draft={draft}
              error={error}
              messages={threadResult?.messages ?? []}
              onAttachmentClick={() => fileInputRef.current?.click()}
              onDraftChange={setDraft}
              onPickCategory={pickCategory}
              onRemoveAttachment={removeAttachment}
              onRatingChange={setRating}
              onSubmit={submitMessage}
              pendingAssistant={pendingAssistant}
              rating={rating}
              selectedAttachments={attachments}
              submitting={submitting || pendingAssistant}
              textareaRef={textareaRef}
              messagesEndRef={messagesEndRef}
            />
          )}

          <input
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            multiple
            onChange={onSelectImages}
            type="file"
          />
        </section>
      ) : null}
    </>
  );
}

function SupportHeader({
  canGoBack,
  onBack,
  onClose,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-5 py-4">
      {canGoBack ? (
        <button
          aria-label="Back"
          className="grid size-9 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="size-5" />
        </button>
      ) : null}
      <span className="grid size-11 place-items-center rounded-xl bg-black text-white">
        <Bot className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold tracking-normal">
          DrNote Support
        </h2>
      </div>
      <button
        aria-label="Close support"
        className="grid size-9 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
        onClick={onClose}
        type="button"
      >
        <X className="size-5" />
      </button>
    </header>
  );
}

function HomePanel(props: {
  activeCategory: SupportCategory;
  onPickCategory: (category: SupportCategory) => void;
  userName?: string;
}) {
  const greeting = props.userName?.trim()
    ? `Hi ${props.userName.trim()}, how can we help?`
    : "Hi, how can we help?";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4f8f6]">
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto mb-5 max-w-[360px] text-center">
          <p className="text-[26px] font-black leading-tight text-zinc-950">
            {greeting}
          </p>
        </div>

        <div className="grid gap-3">
          {categories.map((item) => (
            <QuickAction
              active={props.activeCategory === item.value}
              key={item.value}
              item={item}
              onClick={() => props.onPickCategory(item.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  activeCategory,
  draft,
  error,
  onAttachmentClick,
  onDraftChange,
  onRemoveAttachment,
  onRatingChange,
  onSubmit,
  rating,
  selectedAttachments,
  submitting,
  textareaRef,
}: {
  activeCategory: SupportCategory;
  draft: string;
  error: string;
  onAttachmentClick: () => void;
  onDraftChange: (value: string) => void;
  onRemoveAttachment: (index: number) => void;
  onRatingChange: (rating: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  rating: number;
  selectedAttachments: LocalAttachment[];
  submitting: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const selected = getCategory(activeCategory);
  const detail = getCategoryDetail(activeCategory);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="rounded-2xl bg-zinc-100 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-zinc-950 shadow-sm">
              <selected.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-zinc-950">{selected.label}</h3>
              <p className="mt-1 text-sm font-medium leading-6 text-zinc-600">
                {detail}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-200 p-4">
        <SupportComposer
          draft={draft}
          error={error}
          onAttachmentClick={onAttachmentClick}
          onDraftChange={onDraftChange}
          onRemoveAttachment={onRemoveAttachment}
          onRatingChange={onRatingChange}
          onSubmit={onSubmit}
          placeholder={selected.placeholder}
          rating={rating}
          selectedAttachments={selectedAttachments}
          showRating={isRatingCategory(activeCategory)}
          submitting={submitting}
          textareaRef={textareaRef}
        />
      </div>
    </div>
  );
}

function ChatPanel({
  activeCategory,
  draft,
  error,
  messages,
  onAttachmentClick,
  onDraftChange,
  onPickCategory,
  onRemoveAttachment,
  onRatingChange,
  onSubmit,
  pendingAssistant,
  rating,
  selectedAttachments,
  submitting,
  textareaRef,
  messagesEndRef,
}: {
  activeCategory: SupportCategory;
  draft: string;
  error: string;
  messages: Array<{
    _id: string;
    role: "user" | "assistant" | "admin" | "system";
    body: string;
    rating?: number;
    attachments?: Array<{
      name: string;
      url: string | null;
      mimeType: string;
    }>;
  }>;
  onAttachmentClick: () => void;
  onDraftChange: (value: string) => void;
  onPickCategory: (category: SupportCategory) => void;
  onRemoveAttachment: (index: number) => void;
  onRatingChange: (rating: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pendingAssistant: boolean;
  rating: number;
  selectedAttachments: LocalAttachment[];
  submitting: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-4">
          <AgentBubble compact />
          {messages.map((message) => (
            <MessageBubble key={message._id} message={message} />
          ))}
          {pendingAssistant ? (
            <div className="max-w-[82%] self-start rounded-[24px] bg-zinc-100 px-4 py-3 text-sm text-zinc-500">
              Thinking...
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-4 pt-2">
        {messages.length <= 2 ? (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {categories.slice(3).map((item) => (
              <button
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950"
                key={item.value}
                onClick={() => onPickCategory(item.value)}
                type="button"
              >
                <item.icon className="size-3.5" />
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <SupportComposer
          draft={draft}
          error={error}
          onAttachmentClick={onAttachmentClick}
          onDraftChange={onDraftChange}
          onRemoveAttachment={onRemoveAttachment}
          onRatingChange={onRatingChange}
          onSubmit={onSubmit}
          placeholder={
            categories.find((item) => item.value === activeCategory)?.placeholder ??
            "Send us a message..."
          }
          rating={rating}
          selectedAttachments={selectedAttachments}
          showRating={isRatingCategory(activeCategory)}
          submitting={submitting}
          textareaRef={textareaRef}
        />
      </div>
    </div>
  );
}

function AgentBubble({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div
        className={cn(
          "max-w-[86%] rounded-[22px] bg-zinc-100 px-4 py-3 text-[15px] font-medium leading-6 text-zinc-950",
          !compact && "text-[16px] leading-7",
        )}
      >
        Hi, I&apos;m DrNote Support.
        <br />
        Ask a question, report an issue, suggest a feature, or leave a review.
      </div>
      <div className="mt-2 flex items-center gap-2 px-1 text-xs font-semibold text-zinc-500">
        <span>DrNote</span>
        <span>Agent</span>
        <span>Just now</span>
      </div>
    </div>
  );
}

function QuickAction({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: (typeof categories)[number];
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex min-h-16 w-full items-center justify-between rounded-2xl border bg-white px-4 py-4 text-left transition",
        active
          ? "border-emerald-800 text-zinc-950 shadow-[0_10px_26px_rgba(6,78,59,0.14)]"
          : "border-transparent text-zinc-950 shadow-[0_8px_24px_rgba(15,23,42,0.07)] hover:border-emerald-200 hover:shadow-[0_10px_28px_rgba(15,23,42,0.1)]",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <item.icon className="size-5 shrink-0 text-zinc-500" />
        <span className="min-w-0 text-base font-bold leading-5">{item.label}</span>
      </span>
      <Send className="size-5 shrink-0 text-zinc-500" />
    </button>
  );
}

function getCategory(value: SupportCategory) {
  return categories.find((item) => item.value === value) ?? categories[0];
}

function MessageBubble({
  message,
}: {
  message: {
    role: "user" | "assistant" | "admin" | "system";
    body: string;
    rating?: number;
    attachments?: Array<{
      name: string;
      url: string | null;
      mimeType: string;
    }>;
  };
}) {
  const fromUser = message.role === "user";
  return (
    <div className={cn("flex flex-col", fromUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[86%] rounded-xl px-4 py-3 text-sm leading-6",
          fromUser
            ? "rounded-[24px] bg-[#24172f] text-white"
            : message.role === "admin"
              ? "rounded-[24px] bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200"
              : "rounded-[24px] bg-zinc-100 text-zinc-950",
        )}
      >
        <SupportMarkdownText text={message.body} />
        {message.rating ? (
          <StarRatingDisplay className="mt-2" rating={message.rating} />
        ) : null}
        {message.attachments?.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {message.attachments.map((attachment) =>
              attachment.url ? (
                <a
                  className="block overflow-hidden rounded-lg border border-zinc-200"
                  href={attachment.url}
                  key={`${attachment.name}-${attachment.url}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={attachment.name}
                    className="h-24 w-full object-cover"
                    src={attachment.url}
                  />
                </a>
              ) : null,
            )}
          </div>
        ) : null}
      </div>
      <div className="mt-1 px-1 text-[11px] font-semibold text-zinc-500">
        {fromUser ? "You" : "DrNote Agent"}
      </div>
    </div>
  );
}

function SupportComposer({
  draft,
  error,
  onAttachmentClick,
  onDraftChange,
  onRemoveAttachment,
  onRatingChange,
  onSubmit,
  placeholder,
  rating,
  selectedAttachments,
  showRating,
  submitting,
  textareaRef,
}: {
  draft: string;
  error: string;
  onAttachmentClick: () => void;
  onDraftChange: (value: string) => void;
  onRemoveAttachment: (index: number) => void;
  onRatingChange: (rating: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  rating: number;
  selectedAttachments: LocalAttachment[];
  showRating?: boolean;
  submitting: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <form className="flex flex-col gap-2" onSubmit={onSubmit}>
      {selectedAttachments.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {selectedAttachments.map((attachment, index) => (
            <div
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10"
              key={attachment.previewUrl}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={attachment.file.name}
                className="h-full w-full object-cover"
                src={attachment.previewUrl}
              />
              <button
                aria-label="Remove image"
                className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/70 text-white"
                onClick={() => onRemoveAttachment(index)}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {showRating ? (
        <StarRatingInput rating={rating} onRatingChange={onRatingChange} />
      ) : null}
      <div className="rounded-[22px] border border-zinc-200 bg-white p-2.5 shadow-[0_10px_35px_rgba(15,23,42,0.07)] focus-within:border-zinc-400">
        <div className="flex items-end gap-2">
          <button
            aria-label="Attach image"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
            onClick={onAttachmentClick}
            type="button"
          >
            <Paperclip className="size-5" />
          </button>
          <textarea
            ref={textareaRef}
            className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 text-zinc-950 outline-none placeholder:text-zinc-400"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={placeholder}
            rows={1}
            value={draft}
          />
          <Button
            className="size-9 rounded-full bg-zinc-950 p-0 text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400"
            disabled={
              (!draft.trim() && selectedAttachments.length === 0 && rating === 0) ||
              submitting
            }
            type="submit"
          >
            {submitting ? (
              <ImageIcon className="size-4 animate-pulse" />
            ) : (
              <Send className="size-4" />
            )}
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </form>
  );
}

function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
    return;
  }

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

function SupportMarkdownText({ text }: { text: string }) {
  const blocks = normalizeSupportMarkdown(text).split(/\n{2,}/);

  return (
    <div className="space-y-2 [&_a]:font-semibold [&_a]:text-emerald-800 [&_a]:underline [&_a]:underline-offset-4 [&_li]:leading-6 [&_p]:leading-6">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter(Boolean);
        const isList = lines.every((line) => /^[-*]\s+/.test(line));
        if (isList) {
          return (
            <ul
              className="ms-4 list-disc space-y-1 marker:text-zinc-500"
              key={`${block}-${blockIndex}`}
            >
              {lines.map((line, lineIndex) => (
                <li key={`${line}-${lineIndex}`}>
                  <InlineMarkdown text={line.replace(/^[-*]\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`${block}-${blockIndex}`}>
            <InlineMarkdown text={lines.join(" ")} />
          </p>
        );
      })}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(
    /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+)/g,
  );

  return (
    <>
      {parts.map((part, index) => {
        const bold = part.match(/^\*\*([^*]+)\*\*$/);
        const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        const bareUrl = part.match(/^(https?:\/\/[^\s).,!?;:]+(?:[^\s).,!?;:]|\/))([).,!?;:]*)$/);
        if (bold) {
          return <strong key={`${part}-${index}`}>{bold[1]}</strong>;
        }
        if (markdownLink) {
          return (
            <a
              href={markdownLink[2]}
              key={`${part}-${index}`}
              rel="noreferrer"
              target="_blank"
            >
              {markdownLink[1]}
            </a>
          );
        }
        if (bareUrl) {
          return (
            <span key={`${part}-${index}`}>
              <a href={bareUrl[1]} rel="noreferrer" target="_blank">
                {bareUrl[1]}
              </a>
              {bareUrl[2]}
            </span>
          );
        }
        return part;
      })}
    </>
  );
}

function normalizeSupportMarkdown(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+\*\s+(?=[A-Z0-9])/g, "\n- ")
    .replace(/^\*\s+/gm, "- ")
    .trim();
}

async function getAssistantReply(args: {
  category: SupportCategory;
  message: string;
  rating?: number;
  hasContactEmail: boolean;
  userName?: string;
  history: Array<{ role: string; body: string }>;
  attachments: UploadedAttachment[];
}) {
  const response = await fetch("/api/support-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: args.category,
      message: args.message,
      rating: args.rating,
      hasContactEmail: args.hasContactEmail,
      userName: args.userName,
      history: args.history,
      attachments: args.attachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    reply?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.reply) {
    throw new Error(payload?.error ?? "Support reply failed.");
  }

  return payload.reply;
}

function isRatingCategory(category: SupportCategory) {
  return category === "review" || category === "rating";
}

function extractEmail(message: string) {
  return (
    message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ??
    ""
  );
}

function getCategoryDetail(category: SupportCategory) {
  if (category === "bug") {
    return "Tell us what happened, what you expected, and where it happened.";
  }
  if (category === "suggest_exam") {
    return "Share the exam name, country or institution, and any source material.";
  }
  if (category === "suggest_feature") {
    return "Describe the workflow this should improve and how urgent it is.";
  }
  if (category === "feedback") {
    return "Send the product feedback you want the team to see.";
  }
  if (category === "review") {
    return "Write a short review and rating for the team.";
  }
  if (category === "rating") {
    return "Choose a rating and add any detail that explains it.";
  }
  return "Ask about uploads, study modes, billing, or anything confusing.";
}

function StarRatingInput({
  rating,
  onRatingChange,
}: {
  rating: number;
  onRatingChange: (rating: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
      <span className="text-sm font-semibold text-zinc-700">Rate DrNote</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            className="grid size-8 place-items-center rounded-lg text-amber-400 transition hover:bg-zinc-100"
            key={value}
            onClick={() => onRatingChange(value)}
            type="button"
          >
            <Star
              className={cn(
                "size-5",
                value <= rating ? "fill-current" : "fill-transparent opacity-45",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function StarRatingDisplay({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          className={cn(
            "size-4 text-amber-400",
            value <= rating ? "fill-current" : "fill-transparent opacity-45",
          )}
          key={value}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-zinc-500">{rating}/5</span>
    </div>
  );
}
