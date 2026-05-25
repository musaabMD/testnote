import { defineWorkflow, getStatus, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { query } from "./_generated/server";

export const processStudyFile = defineWorkflow(components.workflow, {
  args: {
    fileHash: v.string(),
    fileName: v.string(),
  },
}).handler(async () => {
  // Skeleton: upload still runs synchronously via /api/pdf/mcqs.
  // Job records are written during extraction for future non-blocking UI.
  return null;
});

export const studyFileProcessingStatus = query({
  args: {
    workflowId: vWorkflowId,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    return await getStatus(ctx, components.workflow, args.workflowId);
  },
});
