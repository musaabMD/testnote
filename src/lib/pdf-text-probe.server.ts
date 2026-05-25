export type {
  PdfTextProbeResult,
} from "@/lib/pdf-text-probe.core.server";
export {
  hasSelectableText,
  SELECTABLE_TEXT_MIN_CHARS,
  SELECTABLE_TEXT_MIN_ITEMS,
} from "@/lib/pdf-text-probe.core.server";
export { probePdfSelectableText } from "@/lib/pdfjs-server.server";
