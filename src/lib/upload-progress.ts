"use client";

export const UPLOAD_PROGRESS_STORAGE_KEY = "drnote:upload-progress";
export const UPLOAD_PROGRESS_UPDATED_EVENT = "drnote:upload-progress-updated";

export type UploadProgressStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "finalizing"
  | "ready"
  | "failed";

export type UploadProgressRecord = {
  id: string;
  fileName: string;
  fileSize: number;
  status: UploadProgressStatus;
  createdAt: number;
  updatedAt: number;
  jobId?: string;
  fileHash?: string;
  progressPagesProcessed?: number;
  totalPages?: number;
  error?: string;
};

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
