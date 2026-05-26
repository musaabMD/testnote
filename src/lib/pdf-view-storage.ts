import {
  PDF_FILE_QUEUE_STORAGE_KEY,
  PDF_MCQ_STORAGE_KEY,
  PDF_SOURCE_STORAGE_KEY,
  isPdfFileQueue,
  isPdfMcqResult,
  isPdfSource,
  type PdfFileQueueItem,
  type PdfSource,
} from "@/lib/pdf-mcqs";
import type { QuestionAnswer } from "@/components/pdf/pdf-study-panel";

export const PDF_FILE_BOOKMARKS_KEY = "drnote-pdf-file-bookmarks";
export const PDF_FILE_UPVOTES_KEY = "drnote-pdf-file-upvotes";
export const PDF_FILE_UPVOTED_IDS_KEY = "drnote-pdf-file-upvoted-ids";
export const PDF_QUESTION_BOOKMARKS_KEY = "drnote-pdf-question-bookmarks";
export const PDF_QUIZ_ANSWERS_KEY = "drnote-pdf-quiz-answers";
export const PDF_FILE_SUBJECTS_KEY = "drnote-pdf-file-subjects";
export const PDF_QUESTION_CHAT_KEY = "drnote-pdf-question-chat";
export const PDF_FILE_QUEUE_UPDATED_EVENT = "drnote:pdf-file-queue-updated";

export type StoredChatMessage = { role: "user" | "assistant"; text: string };

export function loadQuestionChatHistories(): Record<string, Record<string, StoredChatMessage[]>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PDF_QUESTION_CHAT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, StoredChatMessage[]>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveQuestionChatHistory(
  fileId: string,
  questionId: string,
  messages: StoredChatMessage[],
) {
  if (typeof window === "undefined") return;
  const all = loadQuestionChatHistories();
  const fileChats = { ...(all[fileId] ?? {}), [questionId]: messages };
  window.localStorage.setItem(
    PDF_QUESTION_CHAT_KEY,
    JSON.stringify({ ...all, [fileId]: fileChats }),
  );
}

export function loadBookmarkedFileIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PDF_FILE_BOOKMARKS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id) => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveBookmarkedFileIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PDF_FILE_BOOKMARKS_KEY, JSON.stringify([...ids]));
}

export function loadFileUpvoteCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PDF_FILE_UPVOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([fileId, count]) => typeof fileId === "string" && typeof count === "number" && count > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function loadUpvotedFileIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PDF_FILE_UPVOTED_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id) => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveFileUpvotes(counts: Record<string, number>, upvotedIds: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PDF_FILE_UPVOTES_KEY, JSON.stringify(counts));
  window.localStorage.setItem(PDF_FILE_UPVOTED_IDS_KEY, JSON.stringify([...upvotedIds]));
}

export function getFileUpvoteCount(fileId: string, counts: Record<string, number>) {
  return counts[fileId] ?? 0;
}

export function loadQuestionBookmarks(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PDF_QUESTION_BOOKMARKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadQuizAnswers(): Record<string, Record<string, QuestionAnswer>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PDF_QUIZ_ANSWERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, QuestionAnswer>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readBrowserStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
}

function migrateBrowserStorageItemToLocal(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
  window.sessionStorage.removeItem(key);
}

function revokeStoredBlobSourceUrl() {
  if (typeof window === "undefined") return;

  const previousSource = readBrowserStorageItem(PDF_SOURCE_STORAGE_KEY);
  if (!previousSource) return;

  try {
    const parsed = JSON.parse(previousSource) as { url?: string };
    if (parsed.url?.startsWith("blob:")) URL.revokeObjectURL(parsed.url);
  } catch {
    window.localStorage.removeItem(PDF_SOURCE_STORAGE_KEY);
    window.sessionStorage.removeItem(PDF_SOURCE_STORAGE_KEY);
  }
}

function writeFileQueueStorage(queue: PdfFileQueueItem[]) {
  if (typeof window === "undefined") return;

  revokeStoredBlobSourceUrl();

  window.localStorage.setItem(PDF_FILE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  const firstItem = queue[0];
  if (firstItem) {
    window.localStorage.setItem(PDF_MCQ_STORAGE_KEY, JSON.stringify(firstItem.result));
    window.localStorage.setItem(PDF_SOURCE_STORAGE_KEY, JSON.stringify(firstItem.source));
  }

  window.sessionStorage.removeItem(PDF_FILE_QUEUE_STORAGE_KEY);
  window.sessionStorage.removeItem(PDF_MCQ_STORAGE_KEY);
  window.sessionStorage.removeItem(PDF_SOURCE_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(PDF_FILE_QUEUE_UPDATED_EVENT));
}

export function loadFiles(): PdfFileQueueItem[] {
  if (typeof window === "undefined") return [];

  const storedQueue = readBrowserStorageItem(PDF_FILE_QUEUE_STORAGE_KEY);
  if (storedQueue) {
    try {
      const parsed = JSON.parse(storedQueue);
      if (isPdfFileQueue(parsed)) {
        if (!window.localStorage.getItem(PDF_FILE_QUEUE_STORAGE_KEY)) {
          migrateBrowserStorageItemToLocal(PDF_FILE_QUEUE_STORAGE_KEY, storedQueue);
        }
        return parsed;
      }
    } catch {
      window.localStorage.removeItem(PDF_FILE_QUEUE_STORAGE_KEY);
      window.sessionStorage.removeItem(PDF_FILE_QUEUE_STORAGE_KEY);
    }
  }

  const storedResult = readBrowserStorageItem(PDF_MCQ_STORAGE_KEY);
  const storedSource = readBrowserStorageItem(PDF_SOURCE_STORAGE_KEY);
  if (!storedResult || !storedSource) return [];

  try {
    const result = JSON.parse(storedResult);
    const source = JSON.parse(storedSource);
    if (!isPdfMcqResult(result) || !isPdfSource(source)) return [];

    const legacyQueue: PdfFileQueueItem[] = [
      {
        id: `single-${source.name}`,
        name: source.name,
        result,
        source,
        status: "completed",
      },
    ];
    writeFileQueueStorage(legacyQueue);
    return legacyQueue;
  } catch {
    return [];
  }
}

type QueueFileSource = {
  id: string;
  fileName?: string;
  queueFileId?: string;
};

/** Map a dashboard source to a processed file in the upload queue. */
export function resolveQueueFileId(
  source: QueueFileSource,
  files: PdfFileQueueItem[],
): string | null {
  if (!files.length) return null;

  if (source.queueFileId && files.some((file) => file.id === source.queueFileId)) {
    return source.queueFileId;
  }

  const byId = files.find((file) => file.id === source.id);
  if (byId) return byId.id;

  if (source.fileName) {
    const byName = files.find((file) => file.name === source.fileName);
    if (byName) return byName.id;
  }

  return files.length === 1 ? files[0]!.id : null;
}

export function findFileById(fileId: string): PdfFileQueueItem | undefined {
  return loadFiles().find((file) => file.id === fileId);
}

export function saveFileQueueItem(file: PdfFileQueueItem) {
  if (typeof window === "undefined") return;

  const queue = loadFiles();
  const index = queue.findIndex((item) => item.id === file.id);
  const nextQueue =
    index >= 0
      ? queue.map((item, itemIndex) => (itemIndex === index ? file : item))
      : [...queue, file];

  writeFileQueueStorage(nextQueue);
}

export function saveFileQueue(queue: PdfFileQueueItem[]) {
  if (typeof window === "undefined" || !queue.length) return;
  writeFileQueueStorage(queue);
}

export function isImageSource(source: PdfSource) {
  return (
    source.mimeType?.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|heic)$/i.test(source.name)
  );
}

export function isLinkResource(file: PdfFileQueueItem): boolean {
  if (file.resourceKind === "link") return true;
  const mime = file.source.mimeType?.toLowerCase() ?? "";
  if (mime === "text/html" || mime === "application/link") return true;
  const url = file.source.url.trim();
  return /^https?:\/\//i.test(url) && mime !== "application/pdf";
}

export function getFilePageCount(file: PdfFileQueueItem): number {
  if (isLinkResource(file)) return 0;
  if (typeof file.pageCount === "number" && file.pageCount > 0) {
    return file.pageCount;
  }

  const sourcePages = file.result.mcqs
    .map((question) => question.sourcePage)
    .filter((page): page is number => typeof page === "number" && page > 0);

  if (sourcePages.length) {
    return Math.max(...sourcePages);
  }

  return isImageSource(file.source) ? 1 : 1;
}

export function getFileAddedAt(file: PdfFileQueueItem): number {
  if (typeof file.addedAt === "number" && file.addedAt > 0) {
    return file.addedAt;
  }

  const idMatch = file.id.match(/^(\d{10,})-/);
  if (idMatch) {
    return Number(idMatch[1]);
  }

  return Date.now();
}

export function getFileAddedBy(file: PdfFileQueueItem): string {
  return file.addedBy?.trim() || "You";
}

export function formatAddedDate(timestamp: number, nowMs = Date.now()): string {
  const date = new Date(timestamp);
  const diffMs = Math.max(0, nowMs - timestamp);
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  }
  if (dayDiff === 0) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;

  const now = new Date(nowMs);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatFileMeta(file: PdfFileQueueItem): string {
  const questions = file.result.mcqs.length;
  const added = formatAddedDate(getFileAddedAt(file));

  if (isLinkResource(file)) {
    return `Link · ${questions} question${questions === 1 ? "" : "s"} · ${added}`;
  }

  const pages = getFilePageCount(file);
  return `${pages} page${pages === 1 ? "" : "s"} · ${questions} question${questions === 1 ? "" : "s"} · ${added}`;
}

export function loadFileSubjects(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PDF_FILE_SUBJECTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFileSubject(fileId: string, subject: string) {
  if (typeof window === "undefined") return;
  const next = { ...loadFileSubjects(), [fileId]: subject.trim() };
  window.localStorage.setItem(PDF_FILE_SUBJECTS_KEY, JSON.stringify(next));
}

export function getFileSubject(fileId: string): string | undefined {
  const subject = loadFileSubjects()[fileId]?.trim();
  return subject || undefined;
}
