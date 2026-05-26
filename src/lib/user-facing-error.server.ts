const INTERNAL_ERROR_PATTERNS = [
  /^npm error/i,
  /registry\.npmjs\.org/i,
  /ENOENT.*sbx_user/i,
  /spawnSync/i,
  /pdf-server-op/i,
  /\bnpx\b/i,
  /syscall mkdir/i,
];

const DEFAULT_EXTRACTION_ERROR =
  "Extraction failed temporarily. Please try again.";

/** Strip server/npm stderr before showing errors in the UI. */
export function sanitizeUserFacingError(
  message: string | undefined,
  fallback = DEFAULT_EXTRACTION_ERROR,
): string {
  const trimmed = (message ?? "").trim();
  if (!trimmed) return fallback;

  for (const pattern of INTERNAL_ERROR_PATTERNS) {
    if (pattern.test(trimmed)) return fallback;
  }

  if (
    trimmed.length > 400 &&
    /(errno|syscall|ENOENT|npm error)/i.test(trimmed)
  ) {
    return fallback;
  }

  return trimmed;
}
