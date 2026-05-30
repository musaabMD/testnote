import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  FAILED_UPLOAD_RECORD_RETENTION_MS,
  getUploadProgressDetail,
  getUploadProgressLabel,
  getUploadProgressPercent,
  loadUploadProgressRecords,
  patchUploadProgressRecord,
  shouldShowGlobalUploadProgress,
  upsertUploadProgressRecord,
  UPLOAD_PROGRESS_STORAGE_KEY,
} from "../upload-progress.ts";

const originalWindow = (globalThis as { window?: unknown }).window;
const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;

function installBrowserStorage() {
  const storage = new Map<string, string>();

  (globalThis as { CustomEvent?: unknown }).CustomEvent = class CustomEvent {
    type: string;

    constructor(type: string) {
      this.type = type;
    }
  };
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    dispatchEvent: () => true,
  };

  return storage;
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }

  if (originalCustomEvent === undefined) {
    delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
  } else {
    (globalThis as { CustomEvent?: unknown }).CustomEvent = originalCustomEvent;
  }
});

describe("upload progress", () => {
  it("removes completed uploads instead of keeping a done toast visible", () => {
    installBrowserStorage();

    const now = Date.now();
    upsertUploadProgressRecord({
      id: "upload-1",
      fileName: "newnew.pdf",
      fileSize: 2_500_000,
      status: "uploading",
      createdAt: now,
      updatedAt: now,
    });

    assert.equal(loadUploadProgressRecords().length, 1);

    const completed = patchUploadProgressRecord("upload-1", {
      status: "ready",
    });

    assert.equal(completed?.status, "ready");
    assert.deepEqual(loadUploadProgressRecords(), []);
    assert.equal(
      (
        globalThis as {
          window: { localStorage: { getItem: (key: string) => string | null } };
        }
      ).window.localStorage.getItem(UPLOAD_PROGRESS_STORAGE_KEY),
      "[]",
    );
  });

  it("describes accepted background jobs as safe to leave", () => {
    const now = Date.now();
    const record = {
      id: "upload-2",
      fileName: "cardio.pdf",
      fileSize: 4_000_000,
      status: "queued" as const,
      phase: "queued" as const,
      createdAt: now,
      updatedAt: now,
      jobId: "job-123",
      totalPages: 12,
      progressPagesProcessed: 0,
    };

    assert.equal(getUploadProgressLabel(record), "Queued in the background");
    assert.equal(
      getUploadProgressDetail(record),
      "12 pages accepted. Safe to leave this page.",
    );
    assert.equal(getUploadProgressPercent(record), 22);
  });

  it("describes transient status-check failures as retrying", () => {
    const now = Date.now();
    const record = {
      id: "upload-3",
      fileName: "promotion.pdf",
      fileSize: 155_000,
      status: "processing" as const,
      phase: "checking_status" as const,
      createdAt: now,
      updatedAt: now,
      jobId: "job-456",
      totalPages: 22,
      progressPagesProcessed: 22,
    };

    assert.equal(getUploadProgressLabel(record), "Checking extraction status");
    assert.equal(
      getUploadProgressDetail(record),
      "Connection hiccup. Retrying the status check.",
    );
  });

  it("hides stale failed uploads instead of keeping the error toast forever", () => {
    const storage = installBrowserStorage();

    const now = Date.now();
    storage.set(
      UPLOAD_PROGRESS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "upload-4",
          fileName: "stale-error.pdf",
          fileSize: 155_000,
          status: "failed",
          createdAt: now - FAILED_UPLOAD_RECORD_RETENTION_MS - 1_000,
          updatedAt: now - FAILED_UPLOAD_RECORD_RETENTION_MS - 1_000,
          error: "Upload failed temporarily. Please try again.",
        },
      ]),
    );

    assert.deepEqual(loadUploadProgressRecords(), []);
  });

  it("suppresses the global toast while an inline uploader owns progress", () => {
    const now = Date.now();
    const record = {
      id: "upload-5",
      fileName: "inline.pdf",
      fileSize: 284_000,
      status: "uploading" as const,
      createdAt: now,
      updatedAt: now,
    };

    assert.equal(
      shouldShowGlobalUploadProgress(record, {
        inlineUploadOwnerActive: true,
        pathname: "/",
      }),
      false,
    );
    assert.equal(
      shouldShowGlobalUploadProgress(record, {
        inlineUploadOwnerActive: false,
        pathname: "/features",
      }),
      true,
    );
  });
});
