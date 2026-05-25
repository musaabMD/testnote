export class ServerConfigError extends Error {
  readonly code = "SERVER_CONFIG_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

export function isDevelopmentStorageAllowed(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isConvexStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CONVEX_URL && process.env.EXTRACTION_STORAGE_SECRET,
  );
}

/** Production must use Convex for cache/job/extraction records — not `.data`. */
export function assertProductionServerStorage(): void {
  if (isDevelopmentStorageAllowed()) return;
  if (!isConvexStorageConfigured()) {
    throw new ServerConfigError(
      "Server storage is not configured. Set NEXT_PUBLIC_CONVEX_URL and EXTRACTION_STORAGE_SECRET before running extraction in production.",
    );
  }
}

export function getStorageConfigErrorResponse(error: unknown): Response | null {
  if (!(error instanceof ServerConfigError)) return null;
  return Response.json(
    {
      error: error.message,
      code: error.code,
      failureReason: "server_config_error",
    },
    { status: 503 },
  );
}
