const EXAM_LIBRARY_KEY = "testnote:exam-library";

export function loadExamLibrary(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXAM_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function saveExamLibrary(slugs: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EXAM_LIBRARY_KEY, JSON.stringify(slugs));
}

export function isExamInLibrary(slug: string): boolean {
  return loadExamLibrary().includes(slug);
}

export function addExamToLibrary(slug: string): string[] {
  const current = loadExamLibrary();
  if (current.includes(slug)) return current;
  const next = [...current, slug];
  saveExamLibrary(next);
  return next;
}

export function removeExamFromLibrary(slug: string): string[] {
  const next = loadExamLibrary().filter((item) => item !== slug);
  saveExamLibrary(next);
  return next;
}

export function toggleExamInLibrary(slug: string): { slugs: string[]; added: boolean } {
  const current = loadExamLibrary();
  if (current.includes(slug)) {
    return { slugs: removeExamFromLibrary(slug), added: false };
  }
  return { slugs: addExamToLibrary(slug), added: true };
}
