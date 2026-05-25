import { getServerSourcePagePreview } from "@/lib/source-preview-store.server";

export const runtime = "nodejs";

/** Priority in client: server → IndexedDB → PDF.js single-page render. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId")?.trim();
  const pageNumber = Number.parseInt(searchParams.get("pageNumber") ?? "", 10);

  if (!fileId || !Number.isFinite(pageNumber) || pageNumber < 1) {
    return Response.json({ error: "fileId and pageNumber are required." }, { status: 400 });
  }

  const preview = await getServerSourcePagePreview(fileId, pageNumber);
  if (!preview) {
    return Response.json({ error: "Page preview not found on server." }, { status: 404 });
  }

  return Response.json(preview);
}
