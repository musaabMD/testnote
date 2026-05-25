import { coercePdfMcqResult, isPdfMcqResult, type PdfMcqResult } from "@/lib/pdf-mcqs";

export type McqValidationFailureReason =
  | "model_invalid_schema"
  | "model_empty_mcqs";

export type McqValidationResult =
  | { ok: true; result: PdfMcqResult }
  | { ok: false; reason: McqValidationFailureReason };

/** Strict validation after JSON parse — requires at least one MCQ. */
export function validateMcqExtractionResponse(parsed: unknown): McqValidationResult {
  const coerced = coercePdfMcqResult(parsed);
  if (!coerced) {
    return { ok: false, reason: "model_invalid_schema" };
  }

  if (!isPdfMcqResult(coerced)) {
    return { ok: false, reason: "model_invalid_schema" };
  }

  if (!coerced.mcqs.length) {
    return { ok: false, reason: "model_empty_mcqs" };
  }

  return { ok: true, result: coerced };
}
