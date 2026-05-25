import {
  PersistentTextStreaming,
  StreamIdValidator,
  type StreamId,
} from "@convex-dev/persistent-text-streaming";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { httpAction, mutation, query } from "./_generated/server";

export const persistentTextStreaming = new PersistentTextStreaming(
  components.persistentTextStreaming,
);

export const createTutorStream = mutation({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    return await persistentTextStreaming.createStream(ctx);
  },
});

export const getStreamBody = query({
  args: {
    streamId: StreamIdValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");

    return await persistentTextStreaming.getStreamBody(
      ctx,
      args.streamId as StreamId,
    );
  },
});

export const streamTutorText = httpAction(async (ctx, request) => {
  const { streamId } = (await request.json()) as { streamId?: string };
  if (!streamId) {
    return Response.json({ error: "Missing streamId." }, { status: 400 });
  }

  const response = await persistentTextStreaming.stream(
    ctx,
    request,
    streamId as StreamId,
    async (_ctx, _request, _streamId, append) => {
      await append("Tutor streaming is wired. Connect this endpoint to your LLM call next.");
    },
  );

  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Vary", "Origin");
  return response;
});
