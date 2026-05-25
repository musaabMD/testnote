const DB_NAME = "drnote-pdf-sources";
const DB_VERSION = 2;
const STORE = "files";
const PAGE_PREVIEW_STORE = "page-previews";

type StoredSourceFile = {
  fileId: string;
  name: string;
  mimeType: string;
  data: ArrayBuffer;
  savedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "fileId" });
      }
      if (!db.objectStoreNames.contains(PAGE_PREVIEW_STORE)) {
        db.createObjectStore(PAGE_PREVIEW_STORE, { keyPath: "cacheKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open PDF store."));
  });
}

export async function saveSourceFile(fileId: string, file: File): Promise<void> {
  if (typeof window === "undefined") return;

  const record: StoredSourceFile = {
    fileId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data: await file.arrayBuffer(),
    savedAt: Date.now(),
  };

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save PDF."));
    tx.objectStore(STORE).put(record);
  });
  db.close();
}

export async function getSourceFile(
  fileId: string,
): Promise<{ data: ArrayBuffer; mimeType: string; name: string } | null> {
  if (typeof window === "undefined" || !fileId) return null;

  try {
    const db = await openDatabase();
    const record = await new Promise<StoredSourceFile | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(fileId);
      request.onsuccess = () => resolve(request.result as StoredSourceFile | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read PDF."));
    });
    db.close();

    if (!record?.data) return null;
    return {
      data: record.data,
      mimeType: record.mimeType,
      name: record.name,
    };
  } catch {
    return null;
  }
}

export async function createObjectUrlForSourceFile(fileId: string): Promise<string | null> {
  const stored = await getSourceFile(fileId);
  if (!stored) return null;
  const blob = new Blob([stored.data], { type: stored.mimeType });
  return URL.createObjectURL(blob);
}
