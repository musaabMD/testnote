const SUPPORTED_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "heic",
  "txt",
  "md",
  "rtf",
]);

const REJECTED_DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx"]);

export const UPLOAD_ACCEPT_ATTRIBUTE = [
  "application/pdf",
  "image/*",
  "text/plain",
  "text/markdown",
  "application/rtf",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".heic",
  ".txt",
  ".md",
  ".rtf",
].join(",");

export function getUploadExtension(file: File): string {
  return file.name.toLowerCase().split(".").pop() ?? "";
}

export function getUnsupportedUploadReasonForNameAndMime(
  fileName: string,
  mimeType: string,
): string | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (REJECTED_DOCUMENT_EXTENSIONS.has(extension)) {
    return "DOC, DOCX, PPT, and PPTX uploads are not supported yet. Export the file to PDF and upload the PDF.";
  }

  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("text/") ||
    mimeType === "application/rtf" ||
    SUPPORTED_EXTENSIONS.has(extension)
  ) {
    return null;
  }

  return "Unsupported file type. Upload a PDF, image, text, markdown, or RTF file.";
}

export function getUnsupportedUploadReason(file: File): string | null {
  return getUnsupportedUploadReasonForNameAndMime(
    file.name,
    inferUploadMimeType(file),
  );
}

export function isSupportedUploadFile(file: File): boolean {
  return getUnsupportedUploadReason(file) === null;
}

export function filterSupportedUploadFiles(files: FileList | File[] | null): File[] {
  if (!files) return [];
  return Array.from(files).filter(isSupportedUploadFile);
}

export function assertSupportedUploadFiles(files: FileList | File[] | null): File[] {
  if (!files) return [];

  const list = Array.from(files);
  const unsupported = list.find((file) => getUnsupportedUploadReason(file));
  if (unsupported) {
    throw new Error(getUnsupportedUploadReason(unsupported) ?? "Unsupported file type.");
  }

  return list;
}

export function inferUploadMimeTypeFromName(
  fileName: string,
  mimeType?: string,
): string {
  if (mimeType) return mimeType;

  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "heic") return "image/heic";
  if (extension === "doc") return "application/msword";
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "ppt") return "application/vnd.ms-powerpoint";
  if (extension === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (extension === "txt") return "text/plain";
  if (extension === "md") return "text/markdown";
  if (extension === "rtf") return "application/rtf";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "mp4") return "video/mp4";
  if (extension === "wav") return "audio/wav";
  if (extension === "webm") return "video/webm";

  return "application/octet-stream";
}

export function inferUploadMimeType(file: File): string {
  return inferUploadMimeTypeFromName(file.name, file.type);
}
