import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdmin } from "./adminAuth";

const supportCategory = v.union(
  v.literal("message"),
  v.literal("bug"),
  v.literal("feedback"),
  v.literal("review"),
  v.literal("suggest_exam"),
  v.literal("suggest_feature"),
  v.literal("rating"),
);

const supportStatus = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved"),
);

type SupportCategory = Doc<"supportThreads">["category"];
type SupportThread = Doc<"supportThreads">;
type SupportAttachment = NonNullable<Doc<"supportMessages">["attachments"]>[number];

const supportAttachment = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
});

export const generateAttachmentUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createThread = mutation({
  args: {
    category: supportCategory,
    message: v.string(),
    email: v.optional(v.string()),
    rating: v.optional(v.number()),
    attachments: v.optional(v.array(supportAttachment)),
    pageUrl: v.optional(v.string()),
    pathname: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = normalizeMessage(args.message);
    const attachments = normalizeAttachments(args.attachments);
    const rating = normalizeRating(args.rating);
    if (!message && attachments.length === 0 && rating === undefined) {
      throw new ConvexError("Message is required.");
    }

    const identity = await ctx.auth.getUserIdentity();
    const user = identity
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
          .unique()
      : null;
    const now = Date.now();
    const category = classifyCategory(args.category, message);
    const contactEmail = normalizeEmail(
      identity?.email ?? user?.email ?? args.email,
    );
    const summary = summarize(message, attachments, rating);
    const threadId = await ctx.db.insert("supportThreads", {
      clerkUserId: identity?.subject,
      userId: user?._id,
      email: contactEmail,
      name: identity?.name ?? user?.name,
      category,
      status: "open",
      priority: inferPriority(category, message),
      rating,
      subject: subjectFrom(message, category),
      initialSummary: summary,
      summary,
      lastMessagePreview: preview(
        message || ratingPreview(rating) || attachmentPreview(attachments),
      ),
      initialPathname: trimOptional(args.pathname),
      pageUrl: trimOptional(args.pageUrl),
      userAgent: trimOptional(args.userAgent),
      messageCount: 1,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("supportMessages", {
      threadId,
      role: "user",
      body: message || ratingPreview(rating) || "Image attached.",
      rating,
      attachments,
      clerkUserId: identity?.subject,
      email: contactEmail,
      createdAt: now,
    });

    return threadId;
  },
});

export const addUserMessage = mutation({
  args: {
    threadId: v.id("supportThreads"),
    message: v.string(),
    email: v.optional(v.string()),
    category: v.optional(supportCategory),
    rating: v.optional(v.number()),
    attachments: v.optional(v.array(supportAttachment)),
  },
  handler: async (ctx, args) => {
    const message = normalizeMessage(args.message);
    const attachments = normalizeAttachments(args.attachments);
    const rating = normalizeRating(args.rating);
    if (!message && attachments.length === 0 && rating === undefined) {
      throw new ConvexError("Message is required.");
    }

    const thread = await requireThreadAccess(ctx, args.threadId);
    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    const category = classifyCategory(args.category ?? thread.category, message);
    const contactEmail = normalizeEmail(identity?.email ?? args.email);
    const summary = combineSummary(thread.summary, message, attachments, rating);
    const patch: Partial<SupportThread> = {
      category,
      priority:
        thread.priority === "high" ? "high" : inferPriority(category, message),
      rating: rating ?? thread.rating,
      email: thread.email ?? contactEmail,
      status: thread.status === "resolved" ? "open" : thread.status,
      summary,
      lastMessagePreview: preview(
        message || ratingPreview(rating) || attachmentPreview(attachments),
      ),
      messageCount: thread.messageCount + 1,
      updatedAt: now,
      resolvedAt: undefined,
      resolvedBy: undefined,
    };

    await ctx.db.patch(args.threadId, patch);
    await ctx.db.insert("supportMessages", {
      threadId: args.threadId,
      role: "user",
      body: message || ratingPreview(rating) || "Image attached.",
      rating,
      attachments,
      clerkUserId: identity?.subject,
      email: contactEmail,
      createdAt: now,
    });

    return args.threadId;
  },
});

export const appendAssistantMessage = mutation({
  args: {
    threadId: v.id("supportThreads"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const message = normalizeMessage(args.message);
    if (!message) {
      throw new ConvexError("Message is required.");
    }

    const thread = await requireThreadAccess(ctx, args.threadId);
    const now = Date.now();
    await ctx.db.patch(args.threadId, {
      summary: combineSummary(thread.summary, message),
      lastMessagePreview: preview(message),
      messageCount: thread.messageCount + 1,
      updatedAt: now,
    });
    await ctx.db.insert("supportMessages", {
      threadId: args.threadId,
      role: "assistant",
      body: message,
      createdAt: now,
    });

    return args.threadId;
  },
});

export const getThreadMessages = query({
  args: {
    threadId: v.id("supportThreads"),
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForViewer(ctx, args.threadId);
    if (!thread) return null;

    const messages = await ctx.db
      .query("supportMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .collect();

    return {
      thread,
      messages: await hydrateMessageAttachments(ctx, messages),
    };
  },
});

export const listThreadsForAdmin = query({
  args: {
    status: v.union(supportStatus, v.literal("all")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const limit = Math.min(args.limit ?? 60, 100);
    const status = args.status;
    if (status === "all") {
      return await ctx.db
        .query("supportThreads")
        .withIndex("by_updated")
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("supportThreads")
      .withIndex("by_status_updated", (q) => q.eq("status", status))
      .order("desc")
      .take(limit);
  },
});

export const listMessagesForAdmin = query({
  args: {
    threadId: v.id("supportThreads"),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const messages = await ctx.db
      .query("supportMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .collect();
    return await hydrateMessageAttachments(ctx, messages);
  },
});

export const updateThreadStatus = mutation({
  args: {
    threadId: v.id("supportThreads"),
    status: supportStatus,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await assertAdmin(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new ConvexError("Support thread not found.");

    const now = Date.now();
    const note = normalizeMessage(args.note ?? "");
    await ctx.db.patch(args.threadId, {
      status: args.status,
      updatedAt: now,
      resolvedAt: args.status === "resolved" ? now : undefined,
      resolvedBy: args.status === "resolved" ? identity.email : undefined,
      lastMessagePreview: note || thread.lastMessagePreview,
      messageCount: note ? thread.messageCount + 1 : thread.messageCount,
    });

    if (note) {
      await ctx.db.insert("supportMessages", {
        threadId: args.threadId,
        role: "admin",
        body: note,
        clerkUserId: identity.subject,
        email: normalizeEmail(identity.email),
        createdAt: now,
      });
    }

    return args.threadId;
  },
});

async function getThreadForViewer(ctx: QueryCtx, threadId: Id<"supportThreads">) {
  const thread = await ctx.db.get(threadId);
  if (!thread) return null;

  const identity = await ctx.auth.getUserIdentity();
  if (thread.clerkUserId && thread.clerkUserId !== identity?.subject) {
    return null;
  }

  return thread;
}

async function requireThreadAccess(
  ctx: MutationCtx,
  threadId: Id<"supportThreads">,
) {
  const thread = await ctx.db.get(threadId);
  if (!thread) {
    throw new ConvexError("Support thread not found.");
  }

  const identity = await ctx.auth.getUserIdentity();
  if (thread.clerkUserId && thread.clerkUserId !== identity?.subject) {
    throw new ConvexError("Support thread access denied.");
  }

  return thread;
}

function normalizeMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 4000);
}

function normalizeAttachments(
  attachments: SupportAttachment[] | undefined,
): SupportAttachment[] {
  return (attachments ?? [])
    .filter((attachment) => attachment.mimeType.startsWith("image/"))
    .slice(0, 3)
    .map((attachment) => ({
      storageId: attachment.storageId,
      name: attachment.name.trim().slice(0, 160) || "image",
      mimeType: attachment.mimeType.slice(0, 100),
      sizeBytes: Math.max(0, attachment.sizeBytes),
    }));
}

function normalizeRating(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 1000) : undefined;
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email || undefined;
}

function classifyCategory(
  selected: SupportCategory,
  message: string,
): SupportCategory {
  const text = message.toLowerCase();
  if (/\b(bug|broken|error|crash|fail|stuck|issue|problem)\b/.test(text)) {
    return "bug";
  }
  if (/\b(rate|rating|stars?|score)\b/.test(text)) {
    return "rating";
  }
  if (/\b(review|testimonial)\b/.test(text)) {
    return "review";
  }
  if (/\b(exam|course|university|board|test bank|qbank)\b/.test(text)) {
    return "suggest_exam";
  }
  if (/\b(feature|tool|workflow|add|support)\b/.test(text)) {
    return "suggest_feature";
  }
  if (/\b(feedback|suggest|idea|request|improve)\b/.test(text)) {
    return "feedback";
  }
  return selected;
}

function inferPriority(category: SupportCategory, message: string) {
  const text = message.toLowerCase();
  if (
    category === "bug" &&
    /\b(cannot|can't|urgent|blocked|payment|billing|lost|delete|crash)\b/.test(text)
  ) {
    return "high" as const;
  }
  return "normal" as const;
}

function subjectFrom(message: string, category: SupportCategory) {
  const fallback = {
    message: "Support message",
    bug: "Bug report",
    feedback: "Feedback",
    review: "Review",
    suggest_exam: "Exam suggestion",
    suggest_feature: "Feature suggestion",
    rating: "App rating",
  } satisfies Record<SupportCategory, string>;
  const first = message.split(/[.!?]/)[0]?.trim();
  if (!first) return fallback[category];
  return first.length > 72 ? `${first.slice(0, 69)}...` : first;
}

function summarize(
  message: string,
  attachments: SupportAttachment[] = [],
  rating?: number,
) {
  return preview(
    [ratingPreview(rating), message, attachmentPreview(attachments)]
      .filter(Boolean)
      .join(" "),
    180,
  );
}

function combineSummary(
  previous: string,
  message: string,
  attachments: SupportAttachment[] = [],
  rating?: number,
) {
  const next = summarize(message, attachments, rating);
  if (!previous) return next;
  return preview(`${previous} | ${next}`, 320);
}

function preview(message: string, limit = 120) {
  return message.length > limit ? `${message.slice(0, limit - 3)}...` : message;
}

function attachmentPreview(attachments: SupportAttachment[]) {
  if (attachments.length === 0) return "";
  return `${attachments.length} image attachment${attachments.length === 1 ? "" : "s"}.`;
}

function ratingPreview(rating: number | undefined) {
  return rating ? `Rated ${rating}/5.` : "";
}

async function hydrateMessageAttachments(
  ctx: QueryCtx,
  messages: Array<Doc<"supportMessages">>,
) {
  return await Promise.all(
    messages.map(async (message) => ({
      ...message,
      attachments: await Promise.all(
        (message.attachments ?? []).map(async (attachment) => ({
          ...attachment,
          url: await ctx.storage.getUrl(attachment.storageId),
        })),
      ),
    })),
  );
}
