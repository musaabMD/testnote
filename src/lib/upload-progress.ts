"use client";

export const UPLOAD_PROGRESS_STORAGE_KEY = "drnote:upload-progress";
export const UPLOAD_PROGRESS_UPDATED_EVENT = "drnote:upload-progress-updated";
export const FAILED_UPLOAD_RECORD_RETENTION_MS = 30_000;

export type UploadProgressStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "finalizing"
  | "ready"
  | "failed";

export type UploadProgressPhase =
  | "checking_file"
  | "counting_pages"
  | "uploading_file"
  | "queued"
  | "checking_status"
  | "reading_pages"
  | "extracting_questions"
  | "saving_results";

export type UploadProgressRecord = {
  id: string;
  fileName: string;
  fileSize: number;
  status: UploadProgressStatus;
  createdAt: number;
  updatedAt: number;
  phase?: UploadProgressPhase;
  jobId?: string;
  fileHash?: string;
  progressPagesProcessed?: number;
  totalPages?: number;
  error?: string;
};

export function getUploadProgressPercent(record: UploadProgressRecord) {
  if (record.status === "ready") return 100;
  if (record.status === "failed") return 100;

  if (record.status === "uploading") {
    if (record.phase === "counting_pages") return 12;
    if (record.phase === "uploading_file") return 16;
    return 8;
  }

  if (!record.totalPages || record.totalPages <= 0) {
    return record.status === "queued" ? 22 : 45;
  }

  const pagePct =
    (Math.max(0, record.progressPagesProcessed ?? 0) / record.totalPages) * 70;
  return Math.min(95, Math.max(22, Math.round(22 + pagePct)));
}

export function getUploadProgressLabel(record: UploadProgressRecord) {
  if (record.status === "failed") return "Upload failed";
  if (record.status === "ready") return "Ready in your library";
  if (record.status === "finalizing" || record.phase === "saving_results") {
    return "Saving results";
  }
  if (record.status === "queued" || record.phase === "queued") {
    return "Queued in the background";
  }
  if (record.phase === "checking_status") return "Checking extraction status";
  if (record.phase === "checking_file") return "Checking file";
  if (record.phase === "counting_pages") return "Counting pages";
  if (record.phase === "uploading_file") return "Uploading file";

  if (record.totalPages) {
    return `Reading page ${Math.min(
      record.totalPages,
      Math.max(1, (record.progressPagesProcessed ?? 0) + 1),
    )} of ${record.totalPages}`;
  }

  return "Looking for questions";
}

export function getUploadProgressDetail(record: UploadProgressRecord) {
  if (record.error) return record.error;
  if (record.status === "failed") return "Open the upload panel to retry.";
  if (record.status === "ready") return "Open the dashboard to start studying.";

  const pageText = record.totalPages
    ? `${record.totalPages} page${record.totalPages === 1 ? "" : "s"}`
    : null;

  if (record.jobId) {
    if (record.phase === "checking_status") {
      return "Connection hiccup. Retrying the status check.";
    }

    return pageText
      ? `${pageText} accepted. Safe to leave this page.`
      : "Accepted. Safe to leave this page.";
  }

  return pageText ? `${pageText} detected.` : "Preparing the upload receipt.";
}

function isUploadProgressRecord(value: unknown): value is UploadProgressRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<UploadProgressRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.fileName === "string" &&
    typeof record.fileSize === "number" &&
    typeof record.status === "string" &&
    typeof record.createdAt === "number" &&
    typeof record.updatedAt === "number"
  );
}

function emitUploadProgressUpdated() {
  window.dispatchEvent(new CustomEvent(UPLOAD_PROGRESS_UPDATED_EVENT));
}

function isStaleFailedRecord(record: UploadProgressRecord, now = Date.now()) {
  return (
    record.status === "failed" &&
    now - record.updatedAt > FAILED_UPLOAD_RECORD_RETENTION_MS
  );
}

export function loadUploadProgressRecords(): UploadProgressRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(UPLOAD_PROGRESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter(isUploadProgressRecord)
          .filter((record) => record.status !== "ready")
          .filter((record) => !isStaleFailedRecord(record))
          .sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  } catch {
    window.localStorage.removeItem(UPLOAD_PROGRESS_STORAGE_KEY);
    return [];
  }
}

function saveUploadProgressRecords(records: UploadProgressRecord[]) {
  if (typeof window === "undefined") return;

  const next = records
    .filter((record) => record.status !== "ready")
    .filter((record) => !isStaleFailedRecord(record))
    .slice(0, 8);
  window.localStorage.setItem(UPLOAD_PROGRESS_STORAGE_KEY, JSON.stringify(next));
  emitUploadProgressUpdated();
}

export function upsertUploadProgressRecord(
  record: UploadProgressRecord,
): UploadProgressRecord {
  const records = loadUploadProgressRecords();
  const now = Date.now();
  const nextRecord = { ...record, updatedAt: now };
  const index = records.findIndex((item) => item.id === record.id);
  const next =
    index >= 0
      ? records.map((item, itemIndex) => (itemIndex === index ? nextRecord : item))
      : [nextRecord, ...records];
  saveUploadProgressRecords(next);
  return nextRecord;
}

export function patchUploadProgressRecord(
  id: string,
  patch: Partial<Omit<UploadProgressRecord, "id" | "createdAt">>,
): UploadProgressRecord | null {
  const records = loadUploadProgressRecords();
  const current = records.find((record) => record.id === id);
  if (!current) return null;
  return upsertUploadProgressRecord({ ...current, ...patch });
}

export function removeUploadProgressRecord(id: string) {
  const records = loadUploadProgressRecords().filter((record) => record.id !== id);
  saveUploadProgressRecords(records);
}

export function clearFinishedUploadProgressRecords() {
  const records = loadUploadProgressRecords().filter(
    (record) => record.status !== "ready" && record.status !== "failed",
  );
  saveUploadProgressRecords(records);
}
