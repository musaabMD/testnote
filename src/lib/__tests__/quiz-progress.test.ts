import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  PDF_QUIZ_PROGRESS_KEY,
  clearQuizProgress,
  loadQuizProgress,
  saveQuizProgress,
} from "../quiz-progress.ts";

describe("quiz-progress", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("returns null when no progress is saved", () => {
    assert.equal(loadQuizProgress("file-a"), null);
  });

  it("saves and loads progress per file", () => {
    saveQuizProgress("file-a", 3);
    saveQuizProgress("file-b", 7);

    assert.equal(loadQuizProgress("file-a")?.index, 3);
    assert.equal(loadQuizProgress("file-b")?.index, 7);
  });

  it("clears progress for one file without affecting others", () => {
    saveQuizProgress("file-a", 2);
    saveQuizProgress("file-b", 5);
    clearQuizProgress("file-a");

    assert.equal(loadQuizProgress("file-a"), null);
    assert.equal(loadQuizProgress("file-b")?.index, 5);
    assert.ok(storage.get(PDF_QUIZ_PROGRESS_KEY)?.includes("file-b"));
  });
});
