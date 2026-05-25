import { attachServerSourcePreviews } from "@/lib/source-preview-store.server";
import { isPdfMcqResult, type PdfMcqResult } from "@/lib/pdf-mcqs";
import type { SourceChunk } from "@/lib/highlightable-source";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        fileId?: unknown;
        result?: unknown;
        sourceChunks?: unknown;
      }
    | null;

  const fileId = typeof body?.fileId === "string" ? body.fileId.trim() : "";
  if (!fileId) {
    return Response.json({ error: "fileId is required." }, { status: 400 });
  }

  if (!isPdfMcqResult(body?.result)) {
    return Response.json({ error: "result is required." }, { status: 400 });
  }

  if (!Array.isArray(body?.sourceChunks)) {
    return Response.json({ error: "sourceChunks is required." }, { status: 400 });
  }

  try {
    const { result, report } = await attachServerSourcePreviews({
      result: body.result as PdfMcqResult,
      sourceChunks: body.sourceChunks as SourceChunk[],
      fileId,
    });

    return Response.json({
      result,
      report,
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
    throw error;
  }
}
