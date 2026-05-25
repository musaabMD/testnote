import { getConvexSourceFileUrl } from "@/lib/convex-source-file.server";
import { getRequestClerkUserId } from "@/lib/request-user.server";
import { getStorageConfigErrorResponse } from "@/lib/server-storage.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const clerkUserId = await getRequestClerkUserId();
  if (!clerkUserId) {
    return Response.json({ error: "Sign in to access source files." }, { status: 401 });
  }

  const fileId = new URL(request.url).searchParams.get("fileId")?.trim();
  if (!fileId) {
    return Response.json({ error: "fileId is required." }, { status: 400 });
  }

  try {
    const row = await getConvexSourceFileUrl({ clerkUserId, fileHash: fileId });
    if (!row) {
      return Response.json({ error: "Source file not found." }, { status: 404 });
    }

    return Response.json({
      fileHash: fileId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      url: row.url,
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
    throw error;
  }
}
