import { extractSourceChunksFromPdf } from "@/lib/pdfjs-server.server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return Response.json({ error: "Upload a PDF file." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Upload a PDF file." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "File is too large." }, { status: 413 });
  }

  const mimeType = file.type || "application/octet-stream";
  const isPdf =
    mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return Response.json(
      { error: "Source chunk extraction currently supports PDF files only." },
      { status: 400 },
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const fileId = formData.get("fileId");
    const chunks = await extractSourceChunksFromPdf(
      arrayBuffer,
      typeof fileId === "string" ? fileId : undefined,
    );

    return Response.json({ chunks });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not extract source chunks from PDF.",
      },
      { status: 500 },
    );
  }
}
