export type ExtractionMode =
  | "extract-only"
  | "extract-and-generate"
  | "choices-provided"
  | "make-choices";

export type PdfQuizSettings = {
  showAnswers: "asIGo" | "atEnd";
  submitMode: "manual" | "auto";
  allowEdit: boolean;
  extractionMode: ExtractionMode;
};

export const PDF_QUIZ_SETTINGS_KEY = "drnote-pdf-quiz-settings";

export const DEFAULT_PDF_QUIZ_SETTINGS: PdfQuizSettings = {
  showAnswers: "asIGo",
  submitMode: "auto",
  allowEdit: false,
  extractionMode: "make-choices",
};

export function loadPdfQuizSettings(): PdfQuizSettings {
  if (typeof window === "undefined") return DEFAULT_PDF_QUIZ_SETTINGS;
  try {
    const raw = window.localStorage.getItem(PDF_QUIZ_SETTINGS_KEY);
    if (!raw) return DEFAULT_PDF_QUIZ_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PdfQuizSettings>;
    return { ...DEFAULT_PDF_QUIZ_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PDF_QUIZ_SETTINGS;
  }
}

export function savePdfQuizSettings(settings: PdfQuizSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PDF_QUIZ_SETTINGS_KEY, JSON.stringify(settings));
}

export const EXTRACTION_MODE_LABELS: Record<ExtractionMode, string> = {
  "extract-only": "Extract questions only (from file)",
  "extract-and-generate": "Extract and generate (not from file)",
  "choices-provided": "Only show choices provided in file",
  "make-choices": "Make choices when missing",
};
