import { start, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";

export const startStudyFileProcessing = mutation({
  args: {
    fileHash: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<WorkflowId> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    return await start(ctx, internal.workflows.processStudyFile, args, {
      startAsync: true,
    });
  },
});
