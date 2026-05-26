import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    externalId: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
    name: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    dailyQuestionGoal: v.optional(v.number()),
    streak: v.optional(v.number()),
    plan: v.optional(
      v.union(
        v.literal("free"),
        v.literal("starter"),
        v.literal("pro"),
        v.literal("school"),
        v.literal("basic"),
      ),
    ),
    billingStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("trialing"),
        v.literal("past_due"),
        v.literal("canceled"),
        v.literal("none"),
      ),
    ),
    monthlyAiBudgetUsd: v.optional(v.number()),
    monthlyPageLimit: v.optional(v.number()),
    monthlyUploadLimit: v.optional(v.number()),
    monthlyFileLimit: v.optional(v.number()),
    monthlyChatLimit: v.optional(v.number()),
    activeJobLimit: v.optional(v.number()),
    activeExtractionLimit: v.optional(v.number()),
    maxPagesPerFile: v.optional(v.number()),
    maxFileSizeBytes: v.optional(v.number()),
    creditsRemaining: v.optional(v.number()),
    monthlyCredits: v.optional(v.number()),
    billingPeriodStart: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_external_id", ["externalId"])
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"]),

  creditLedger: defineTable({
    userId: v.id("users"),
    action: v.union(
      v.literal("pdf_extract"),
      v.literal("tutor_chat_fast"),
      v.literal("tutor_chat_better"),
      v.literal("tutor_chat_deep"),
      v.literal("ocr"),
      v.literal("grammar_fix"),
      v.literal("credit_purchase"),
      v.literal("subscription_grant"),
    ),
    credits: v.number(),
    fileHash: v.optional(v.string()),
    model: v.optional(v.string()),
    openRouterCostUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_file_hash", ["fileHash"]),

  pdfExtractions: defineTable({
    userId: v.id("users"),
    fileHash: v.string(),
    fileName: v.string(),
    pageCount: v.number(),
    creditsCharged: v.number(),
    resultJson: v.any(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_file_hash", ["fileHash"]),

  fileCache: defineTable({
    fileHash: v.string(),
    extractionMode: v.string(),
    extractionModel: v.string(),
    appExtractionVersion: v.string(),
    pageCount: v.number(),
    title: v.string(),
    summary: v.string(),
    mcqs: v.any(),
    sourceChunks: v.any(),
    createdAt: v.number(),
  }).index("by_cache_key", [
    "fileHash",
    "extractionMode",
    "extractionModel",
    "appExtractionVersion",
  ]),

  extractionJobs: defineTable({
    jobId: v.string(),
    extractionKey: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    fileHash: v.string(),
    clerkUserId: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    progressPagesProcessed: v.number(),
    totalPages: v.number(),
    error: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job_id", ["jobId"])
    .index("by_file_hash", ["fileHash"])
    .index("by_extraction_key", ["extractionKey"]),

  pdfExtractionRecords: defineTable({
    clerkUserId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
    appExtractionVersion: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
    mcqs: v.any(),
    sourceChunks: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file_hash", ["fileHash"])
    .index("by_clerk_user", ["clerkUserId"])
    .index("by_clerk_user_file_hash", ["clerkUserId", "fileHash"]),

  sourceFiles: defineTable({
    fileHash: v.string(),
    clerkUserId: v.string(),
    storageProvider: v.optional(v.union(v.literal("convex"), v.literal("r2"))),
    storageId: v.optional(v.id("_storage")),
    r2Key: v.optional(v.string()),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file_hash", ["fileHash"])
    .index("by_clerk_user_file_hash", ["clerkUserId", "fileHash"]),

  questionSources: defineTable({
    questionId: v.string(),
    fileId: v.string(),
    sourcePagePreviewId: v.string(),
    pageNumber: v.number(),
    imageUrl: v.string(),
    width: v.number(),
    height: v.number(),
    sourceRegion: v.any(),
    highlightConfirmed: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_question_id", ["questionId"])
    .index("by_file_id", ["fileId"]),

  aiRequests: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    model: v.string(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    status: v.union(v.literal("started"), v.literal("succeeded"), v.literal("failed")),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"]),

  usagePeriods: defineTable({
    userId: v.id("users"),
    periodStart: v.number(),
    periodEnd: v.number(),
    aiCostUsd: v.number(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.optional(v.number()),
    pagesProcessed: v.number(),
    filesUploaded: v.number(),
    extractionJobs: v.number(),
    chatMessages: v.number(),
    updatedAt: v.number(),
  }).index("by_user_period", ["userId", "periodStart"]),

  aiUsageEvents: defineTable({
    userId: v.id("users"),
    jobId: v.optional(v.string()),
    fileHash: v.optional(v.string()),
    feature: v.union(
      v.literal("extract"),
      v.literal("ask"),
      v.literal("tutor"),
      v.literal("grammar"),
      v.literal("ocr"),
    ),
    provider: v.literal("openrouter"),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    costUsd: v.number(),
    openRouterGenerationId: v.optional(v.string()),
    cached: v.optional(v.boolean()),
    status: v.union(
      v.literal("estimated"),
      v.literal("final"),
      v.literal("failed"),
      v.literal("refunded"),
    ),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_feature", ["feature"]),

  quotaReservations: defineTable({
    userId: v.id("users"),
    jobId: v.optional(v.string()),
    feature: v.union(
      v.literal("extract"),
      v.literal("ask"),
      v.literal("tutor"),
      v.literal("grammar"),
      v.literal("ocr"),
    ),
    estimatedCostUsd: v.number(),
    estimatedPages: v.optional(v.number()),
    status: v.union(
      v.literal("reserved"),
      v.literal("committed"),
      v.literal("released"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_job", ["jobId"]),

  appAuditEvents: defineTable({
    userId: v.optional(v.string()),
    eventType: v.union(
      v.literal("quota_exceeded"),
      v.literal("rate_limited"),
      v.literal("source_not_ready"),
      v.literal("source_payload_missing"),
      v.literal("source_region_invalid"),
      v.literal("source_image_load_failed"),
      v.literal("duplicate_extraction_waiter"),
      v.literal("duplicate_extraction_owner"),
      v.literal("openrouter_call_blocked"),
      v.literal("budget_warning_75"),
      v.literal("budget_warning_90"),
    ),
    feature: v.optional(
      v.union(
        v.literal("extract"),
        v.literal("ask"),
        v.literal("tutor"),
        v.literal("grammar"),
        v.literal("ocr"),
        v.literal("source"),
        v.literal("rate_limit"),
      ),
    ),
    fileHash: v.optional(v.string()),
    questionId: v.optional(v.string()),
    jobId: v.optional(v.string()),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_event_type", ["eventType"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_job", ["jobId"])
    .index("by_file_hash", ["fileHash"]),

  examCatalog: defineTable({
    slug: v.string(),
    name: v.string(),
    country: v.string(),
    countryName: v.string(),
    category: v.union(
      v.literal("Medical"),
      v.literal("Dental"),
      v.literal("Legal"),
      v.literal("Language"),
      v.literal("Pharmacy"),
      v.literal("Nursing"),
      v.literal("Laboratory"),
      v.literal("Radiology"),
    ),
    description: v.string(),
    details: v.string(),
    fileCount: v.number(),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_country", ["countryName"])
    .index("by_category", ["category"])
    .index("by_active_sort", ["isActive", "sortOrder"]),
});
