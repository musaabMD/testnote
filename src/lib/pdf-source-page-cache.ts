import type { SourceChunk } from "@/lib/highlightable-source";

export type CachedSourcePagePreview = {
  cacheKey: string;
  fileId: string;
  pageNumber: number;
  imageDataUrl: string;
  width: number;
  height: number;
  savedAt: number;
};

export type PagePreviewLoadResult = {
  imageUrl: string;
  width: number;
  height: number;
  cacheSource: "server" | "indexeddb" | "pdfjs";
};

const DB_NAME = "drnote-pdf-sources";
const DB_VERSION = 2;
const PAGE_PREVIEW_STORE = "page-previews";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAGE_PREVIEW_STORE)) {
        db.createObjectStore(PAGE_PREVIEW_STORE, { keyPath: "cacheKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open page preview store."));
  });
}

export function pageCacheKey(fileId: string, pageNumber: number) {
  return `${fileId}:${pageNumber}:pdfjs-v2`;
}

export async function getCachedSourcePagePreview(
  fileId: string,
  pageNumber: number,
): Promise<CachedSourcePagePreview | null> {
  if (typeof window === "undefined" || !fileId) return null;

  try {
    const db = await openDatabase();
    const record = await new Promise<CachedSourcePagePreview | undefined>((resolve, reject) => {
      const tx = db.transaction(PAGE_PREVIEW_STORE, "readonly");
      const request = tx.objectStore(PAGE_PREVIEW_STORE).get(pageCacheKey(fileId, pageNumber));
      request.onsuccess = () => resolve(request.result as CachedSourcePagePreview | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read page preview."));
    });
    db.close();
    return record ?? null;
  } catch {
    return null;
  }
}

export async function saveCachedSourcePagePreview(
  preview: Omit<CachedSourcePagePreview, "cacheKey" | "savedAt">,
): Promise<void> {
  if (typeof window === "undefined") return;

  const record: CachedSourcePagePreview = {
    ...preview,
    cacheKey: pageCacheKey(preview.fileId, preview.pageNumber),
    savedAt: Date.now(),
  };

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PAGE_PREVIEW_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save page preview."));
    tx.objectStore(PAGE_PREVIEW_STORE).put(record);
  });
  db.close();
}

export async function clearCachedSourcePagesForFile(fileId: string): Promise<void> {
  if (typeof window === "undefined" || !fileId) return;

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PAGE_PREVIEW_STORE, "readwrite");
      const store = tx.objectStore(PAGE_PREVIEW_STORE);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (key.startsWith(`${fileId}:`)) {
          cursor.delete();
        }
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not clear page previews."));
    });
    db.close();
  } catch {
    // Non-fatal.
  }
}

export type { SourceChunk };
