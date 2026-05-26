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
    if (!row?.url) {
      return Response.json({ error: "Source file not found." }, { status: 404 });
    }

    const upstream = await fetch(row.url);
    if (!upstream.ok) {
      return Response.json({ error: "Could not load source file." }, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": row.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${row.fileName.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const configError = getStorageConfigErrorResponse(error);
    if (configError) return configError;
    throw error;
  }
}
