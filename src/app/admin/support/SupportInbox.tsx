"use client";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, CheckCircle2, Clock3, Inbox, Send, Star } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type StatusFilter = "all" | "open" | "in_progress" | "resolved";
type SupportStatus = "open" | "in_progress" | "resolved";

const statuses: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

export function SupportInbox() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [selectedThreadId, setSelectedThreadId] =
    useState<Id<"supportThreads"> | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const threads = useQuery(api.support.listThreadsForAdmin, {
    status,
    limit: 80,
  });
  const messages = useQuery(
    api.support.listMessagesForAdmin,
    selectedThreadId ? { threadId: selectedThreadId } : "skip",
  );
  const updateStatus = useMutation(api.support.updateThreadStatus);

  const selectedThread = useMemo(() => {
    return threads?.find((thread) => thread._id === selectedThreadId) ?? threads?.[0];
  }, [selectedThreadId, threads]);

  async function updateThread(nextStatus: SupportStatus, event?: FormEvent) {
    event?.preventDefault();
    const threadId = selectedThread?._id;
    if (!threadId || saving) return;

    setSaving(true);
    try {
      await updateStatus({
        threadId,
        status: nextStatus,
        note: note.trim() || undefined,
      });
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
              href="/admin"
            >
              <ArrowLeft className="size-4" />
              Admin
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase text-violet-300">
              Support inbox
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              User chats and issues
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {statuses.map((item) => (
              <button
                key={item.value}
                className={cn(
                  "h-9 rounded-lg border px-3 text-sm font-semibold transition",
                  status === item.value
                    ? "border-violet-300 bg-violet-300 text-zinc-950"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                )}
                onClick={() => setStatus(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <section className="grid min-h-[680px] overflow-hidden rounded-lg border border-white/10 bg-zinc-900/70 lg:grid-cols-[390px_1fr]">
          <aside className="border-b border-white/10 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300">
              <Inbox className="size-4" />
              {threads ? `${threads.length} threads` : "Loading"}
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {threads?.map((thread) => (
                <button
                  key={thread._id}
                  className={cn(
                    "w-full border-b border-white/10 px-4 py-4 text-left transition hover:bg-white/5",
                    selectedThread?._id === thread._id && "bg-white/10",
                  )}
                  onClick={() => setSelectedThreadId(thread._id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {thread.subject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                        {thread.summary}
                      </p>
                    </div>
                    <StatusBadge status={thread.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{thread.email ?? thread.clerkUserId ?? "Anonymous"}</span>
                    <span>{formatDate(thread.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {selectedThread ? (
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-white/10 px-5 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-normal">
                        {selectedThread.subject}
                      </h2>
                      <StatusBadge status={selectedThread.status} />
                      {selectedThread.priority === "high" ? (
                        <Badge className="bg-rose-400 text-zinc-950">High</Badge>
                      ) : null}
                      {selectedThread.rating ? (
                        <RatingBadge rating={selectedThread.rating} />
                      ) : null}
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                      {selectedThread.summary}
                    </p>
                  </div>
                  <div className="text-left text-xs leading-5 text-zinc-500 md:text-right">
                    <p>{selectedThread.email ?? "No email"}</p>
                    <p>{selectedThread.initialPathname ?? "No path"}</p>
                    <p>{formatDate(selectedThread.createdAt)}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="flex flex-col gap-3">
                  {messages?.map((message) => (
                    <div
                      key={message._id}
                      className={cn(
                        "max-w-[78%] rounded-lg px-3 py-2 text-sm leading-6",
                        message.role === "user"
                          ? "self-end bg-white text-zinc-950"
                          : message.role === "admin"
                            ? "self-start bg-emerald-400/15 text-emerald-50 ring-1 ring-emerald-300/20"
                            : "self-start bg-white/10 text-zinc-100",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase text-current opacity-60">
                        <span>{message.role}</span>
                        <span>{formatDate(message.createdAt)}</span>
                      </div>
                      {message.body}
                      {message.rating ? (
                        <RatingStars rating={message.rating} />
                      ) : null}
                      {message.attachments?.length ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {message.attachments.map((attachment) =>
                            attachment.url ? (
                              <a
                                className="block overflow-hidden rounded-lg border border-white/10"
                                href={attachment.url}
                                key={`${attachment.name}-${attachment.url}`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  alt={attachment.name}
                                  className="h-28 w-full object-cover"
                                  src={attachment.url}
                                />
                              </a>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <form
                className="border-t border-white/10 p-4"
                onSubmit={(event) => updateThread("in_progress", event)}
              >
                <textarea
                  className="min-h-24 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-300"
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Internal or user-facing resolution note..."
                  value={note}
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    className="bg-white/10 text-white hover:bg-white/15"
                    disabled={saving}
                    onClick={() => updateThread("in_progress")}
                    type="button"
                  >
                    <Clock3 className="size-4" />
                    In progress
                  </Button>
                  <Button
                    className="bg-emerald-400 text-zinc-950 hover:bg-emerald-300"
                    disabled={saving}
                    onClick={() => updateThread("resolved")}
                    type="button"
                  >
                    <CheckCircle2 className="size-4" />
                    Resolve
                  </Button>
                  <Button
                    className="bg-violet-500 text-white hover:bg-violet-400"
                    disabled={saving || !note.trim()}
                    type="submit"
                  >
                    <Send className="size-4" />
                    Add note
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="grid place-items-center p-8 text-center text-zinc-500">
              <div>
                <Inbox className="mx-auto size-10" />
                <p className="mt-3 text-sm">No support threads in this view.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  return (
    <Badge className="bg-amber-300 text-zinc-950">
      <Star className="size-3 fill-current" />
      {rating}/5
    </Badge>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="mt-2 flex items-center gap-1 text-amber-300">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          className={cn("size-4", value <= rating ? "fill-current" : "opacity-35")}
          key={value}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-current">{rating}/5</span>
    </div>
  );
}

function StatusBadge({ status }: { status: SupportStatus }) {
  const className =
    status === "resolved"
      ? "bg-emerald-400 text-zinc-950"
      : status === "in_progress"
        ? "bg-sky-300 text-zinc-950"
        : "bg-amber-300 text-zinc-950";
  return <Badge className={className}>{status.replace("_", " ")}</Badge>;
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
