import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  loadUploadProgressRecords,
  patchUploadProgressRecord,
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
});
