import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertProductionServerStorage,
  isConvexStorageConfigured,
  isDevelopmentStorageAllowed,
} from "@/lib/server-storage.server";

export type PageComplexity =
  | "text_selectable"
  | "normal_image"
  | "dense_image"
  | "noise";

export type ExtractionPageMode =
  | "existing_questions"
  | "study_content"
  | "mixed"
  | "noise";

export type ExtractionPageStatus =
  | "pending"
  | "processing"
  | "done"
  | "needs_review"
  | "failed";

export type ExtractionPageRecord = {
  jobId: string;
  fileHash: string;
  clerkUserId?: string;
  pageIndex: number;
  previewR2Key?: string;
  imageBase64R2Key?: string;
  text?: string;
  width?: number;
  height?: number;
  complexity?: PageComplexity;
  puCost?: number;
  mode?: ExtractionPageMode;
  candidateQuestionCount?: number;
  status: ExtractionPageStatus;
};

export type ExtractionPageAuditStatus = "passed" | "partial" | "failed";

export type ExtractionPageAuditRecord = {
  jobId: string;
  fileHash: string;
  pageIndex: number;
  mode?: string;
  candidateQuestionCount: number;
  extractedQuestionCount: number;
  generatedQuestionCount: number;
  incompleteCount: number;
  needsReviewCount: number;
  retryCount: number;
  status: ExtractionPageAuditStatus;
  warnings: string[];
};

const PAGE_DIR = path.join(process.cwd(), ".data", "extraction-pages");
const AUDIT_DIR = path.join(process.cwd(), ".data", "extraction-page-audits");

async function ensureDir(dir: string) {
  if (!isDevelopmentStorageAllowed()) return;
  await mkdir(dir, { recursive: true });
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function pageFilePath(jobId: string, pageIndex: number) {
  return path.join(PAGE_DIR, `${safeSegment(jobId)}-${pageIndex}.json`);
}

function auditFilePath(jobId: string, pageIndex: number) {
  return path.join(AUDIT_DIR, `${safeSegment(jobId)}-${pageIndex}.json`);
}

export async function upsertExtractionPage(
  page: ExtractionPageRecord,
): Promise<void> {
  assertProductionServerStorage();

  if (isConvexStorageConfigured()) {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await client.mutation(api.extractionStorage.upsertExtractionPage, {
      secret: process.env.EXTRACTION_STORAGE_SECRET!,
      ...page,
    });
  } else if (!isDevelopmentStorageAllowed()) {
    throw new Error(
      "Cannot persist extraction page in production without Convex storage.",
    );
  }

  if (isDevelopmentStorageAllowed()) {
    await ensureDir(PAGE_DIR);
    await writeFile(pageFilePath(page.jobId, page.pageIndex), JSON.stringify(page), "utf8");
  }
}

export async function upsertExtractionPageAudit(
  audit: ExtractionPageAuditRecord,
): Promise<void> {
  assertProductionServerStorage();

  if (isConvexStorageConfigured()) {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../../convex/_generated/api");
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await client.mutation(api.extractionStorage.upsertExtractionPageAudit, {
      secret: process.env.EXTRACTION_STORAGE_SECRET!,
      ...audit,
    });
  } else if (!isDevelopmentStorageAllowed()) {
    throw new Error(
      "Cannot persist extraction page audit in production without Convex storage.",
    );
  }

  if (isDevelopmentStorageAllowed()) {
    await ensureDir(AUDIT_DIR);
    await writeFile(
      auditFilePath(audit.jobId, audit.pageIndex),
      JSON.stringify(audit),
      "utf8",
    );
  }
}

export async function getLocalExtractionPageAudit(
  jobId: string,
  pageIndex: number,
): Promise<ExtractionPageAuditRecord | null> {
  if (!isDevelopmentStorageAllowed()) return null;

  try {
    const raw = await readFile(auditFilePath(jobId, pageIndex), "utf8");
    return JSON.parse(raw) as ExtractionPageAuditRecord;
  } catch {
    return null;
  }
}
