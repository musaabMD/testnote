import { defineApp } from "convex/server";
import actionCache from "@convex-dev/action-cache/convex.config.js";
import r2 from "@convex-dev/r2/convex.config.js";
import rag from "@convex-dev/rag/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config.js";
import resend from "@convex-dev/resend/convex.config.js";
import stripe from "@convex-dev/stripe/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import posthog from "@posthog/convex/convex.config.js";

const app = defineApp();

app.use(actionCache);
app.use(r2);
app.use(rag);
app.use(rateLimiter);
app.use(persistentTextStreaming);
app.use(resend);
app.use(stripe);
app.use(workflow);
app.use(posthog);

export default app;
