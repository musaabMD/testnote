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
    lastStudyDay: v.optional(v.string()),
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
    promptVersion: v.optional(v.string()),
    schemaVersion: v.optional(v.string()),
    renderVersion: v.optional(v.string()),
    pageCount: v.number(),
    title: v.string(),
    summary: v.string(),
    mcqs: v.optional(v.any()),
    sourceChunks: v.optional(v.any()),
    payloadStorage: v.optional(v.union(v.literal("convex"), v.literal("r2"))),
    payloadR2Key: v.optional(v.string()),
    payloadSizeBytes: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_cache_key", [
    "fileHash",
    "extractionMode",
    "extractionModel",
    "appExtractionVersion",
    "promptVersion",
    "schemaVersion",
    "renderVersion",
  ]),

  extractionJobs: defineTable({
    jobId: v.string(),
    extractionKey: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    fileHash: v.string(),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    extractionMode: v.optional(v.string()),
    extractionModel: v.optional(v.string()),
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
    .index("by_status_updated", ["status", "updatedAt"])
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
    mcqs: v.optional(v.any()),
    sourceChunks: v.optional(v.any()),
    payloadStorage: v.optional(v.union(v.literal("convex"), v.literal("r2"))),
    payloadR2Key: v.optional(v.string()),
    payloadSizeBytes: v.optional(v.number()),
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

  extractionPages: defineTable({
    jobId: v.string(),
    fileHash: v.string(),
    clerkUserId: v.optional(v.string()),
    pageIndex: v.number(),
    previewR2Key: v.optional(v.string()),
    imageBase64R2Key: v.optional(v.string()),
    text: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    complexity: v.optional(
      v.union(
        v.literal("text_selectable"),
        v.literal("normal_image"),
        v.literal("dense_image"),
        v.literal("noise"),
      ),
    ),
    puCost: v.optional(v.number()),
    mode: v.optional(
      v.union(
        v.literal("existing_questions"),
        v.literal("study_content"),
        v.literal("mixed"),
        v.literal("noise"),
      ),
    ),
    candidateQuestionCount: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("needs_review"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job_page", ["jobId", "pageIndex"])
    .index("by_file_hash", ["fileHash"]),

  extractionPageAudits: defineTable({
    jobId: v.string(),
    fileHash: v.string(),
    pageIndex: v.number(),
    mode: v.optional(v.string()),
    candidateQuestionCount: v.number(),
    extractedQuestionCount: v.number(),
    generatedQuestionCount: v.number(),
    incompleteCount: v.number(),
    needsReviewCount: v.number(),
    retryCount: v.number(),
    status: v.union(v.literal("passed"), v.literal("partial"), v.literal("failed")),
    warnings: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job_page", ["jobId", "pageIndex"])
    .index("by_file_hash", ["fileHash"]),

  extractionSourceBlocks: defineTable({
    jobId: v.string(),
    fileHash: v.string(),
    pageIndex: v.number(),
    subIndex: v.optional(v.number()),
    blockType: v.union(
      v.literal("question"),
      v.literal("answer_key"),
      v.literal("study_content"),
      v.literal("noise"),
    ),
    text: v.string(),
    bbox: v.optional(
      v.object({
        ymin: v.number(),
        xmin: v.number(),
        ymax: v.number(),
        xmax: v.number(),
      }),
    ),
    confidence: v.number(),
    detectionMethod: v.union(v.literal("regex"), v.literal("ai")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_file_hash", ["fileHash"]),

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

  supportThreads: defineTable({
    clerkUserId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    category: v.union(
      v.literal("message"),
      v.literal("bug"),
      v.literal("feedback"),
      v.literal("review"),
      v.literal("suggest_exam"),
      v.literal("suggest_feature"),
      v.literal("rating"),
    ),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
    ),
    priority: v.union(v.literal("normal"), v.literal("high")),
    rating: v.optional(v.number()),
    subject: v.string(),
    initialSummary: v.string(),
    summary: v.string(),
    lastMessagePreview: v.string(),
    initialPathname: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    messageCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
  })
    .index("by_clerk_user_updated", ["clerkUserId", "updatedAt"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_updated", ["updatedAt"]),

  supportMessages: defineTable({
    threadId: v.id("supportThreads"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("admin"),
      v.literal("system"),
    ),
    body: v.string(),
    rating: v.optional(v.number()),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          name: v.string(),
          mimeType: v.string(),
          sizeBytes: v.number(),
        }),
      ),
    ),
    clerkUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_thread_created", ["threadId", "createdAt"])
    .index("by_created", ["createdAt"]),

  userProfiles: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    plan: v.union(
      v.literal("free"),
      v.literal("basic"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("school"),
    ),
    examGoal: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    subscriptionStatus: v.union(
      v.literal("free"),
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("none"),
    ),
    createdAt: v.number(),
    lastActiveAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  billingLedger: defineTable({
    userId: v.string(),
    event: v.union(
      v.literal("subscription_payment"),
      v.literal("pu_pack_purchase"),
      v.literal("refund"),
      v.literal("chargeback"),
    ),
    stripeInvoiceId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    grossAmountUsd: v.number(),
    stripeFeeUsd: v.number(),
    netRevenueUsd: v.number(),
    plan: v.union(
      v.literal("basic"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("school"),
      v.literal("pack"),
      v.literal("free"),
    ),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_created", ["createdAt"])
    .index("by_stripe_invoice", ["stripeInvoiceId"])
    .index("by_stripe_payment_intent", ["stripePaymentIntentId"]),

  costLedger: defineTable({
    userId: v.string(),
    fileId: v.optional(v.string()),
    jobId: v.optional(v.string()),
    category: v.union(
      v.literal("ai"),
      v.literal("worker"),
      v.literal("r2_storage"),
      v.literal("r2_operations"),
      v.literal("convex"),
      v.literal("other"),
    ),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    units: v.number(),
    unitCostUsd: v.number(),
    costUsd: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_created", ["createdAt"])
    .index("by_category", ["category"])
    .index("by_file", ["fileId"])
    .index("by_job", ["jobId"]),

  fileAnalytics: defineTable({
    fileId: v.string(),
    userId: v.string(),
    originalName: v.string(),
    mimeType: v.string(),
    fileType: v.union(
      v.literal("selectable_pdf"),
      v.literal("scanned_pdf"),
      v.literal("dense_notability"),
      v.literal("slide_pdf"),
      v.literal("image"),
      v.literal("text"),
      v.literal("other"),
    ),
    examGoal: v.optional(v.string()),
    pageCount: v.number(),
    puReserved: v.number(),
    puCharged: v.number(),
    puRefunded: v.number(),
    questionCount: v.number(),
    extractedCount: v.number(),
    generatedCount: v.number(),
    needsReviewCount: v.number(),
    retryCount: v.number(),
    failedPageCount: v.number(),
    noisePageCount: v.number(),
    aiCostUsd: v.number(),
    workerCostUsd: v.number(),
    r2CostUsd: v.number(),
    convexCostUsd: v.number(),
    totalCostUsd: v.number(),
    processingStartedAt: v.number(),
    processingFinishedAt: v.number(),
    processingMs: v.number(),
    status: v.union(
      v.literal("done"),
      v.literal("failed"),
      v.literal("partial"),
      v.literal("processing"),
    ),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_file", ["fileId"])
    .index("by_started", ["processingStartedAt"])
    .index("by_status", ["status"]),

  jobSummaries: defineTable({
    jobId: v.string(),
    userId: v.string(),
    fileId: v.string(),
    pageCount: v.number(),
    puReserved: v.number(),
    puCharged: v.number(),
    puRefunded: v.number(),
    existingQuestionPages: v.number(),
    studyContentPages: v.number(),
    mixedPages: v.number(),
    noisePages: v.number(),
    extractedQuestions: v.number(),
    generatedQuestions: v.number(),
    incompleteQuestions: v.number(),
    needsReviewQuestions: v.number(),
    geminiCalls: v.number(),
    openRouterCalls: v.number(),
    retryCount: v.number(),
    level3RetryCount: v.number(),
    aiInputTokens: v.number(),
    aiOutputTokens: v.number(),
    aiCostUsd: v.number(),
    workerMs: v.number(),
    workerCostUsd: v.number(),
    r2BytesWritten: v.number(),
    r2OperationCount: v.number(),
    r2CostUsd: v.number(),
    totalCostUsd: v.number(),
    startedAt: v.number(),
    finishedAt: v.number(),
    status: v.union(v.literal("done"), v.literal("failed"), v.literal("partial")),
  })
    .index("by_job", ["jobId"])
    .index("by_user", ["userId"])
    .index("by_file", ["fileId"])
    .index("by_started", ["startedAt"]),

  userQuota: defineTable({
    userId: v.string(),
    plan: v.union(
      v.literal("free"),
      v.literal("basic"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("school"),
    ),
    monthlyPuLimit: v.number(),
    dailyPuLimit: v.number(),
    currentMonthPu: v.number(),
    todayPu: v.number(),
    extraPuBalance: v.number(),
    resetAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_reset", ["resetAt"]),

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
