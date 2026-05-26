/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminAccess from "../adminAccess.js";
import type * as apiRateLimits from "../apiRateLimits.js";
import type * as auditEvents from "../auditEvents.js";
import type * as billing from "../billing.js";
import type * as billingQueries from "../billingQueries.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as exams from "../exams.js";
import type * as extractionStorage from "../extractionStorage.js";
import type * as http from "../http.js";
import type * as planLimits from "../planLimits.js";
import type * as posthog from "../posthog.js";
import type * as r2 from "../r2.js";
import type * as rateLimits from "../rateLimits.js";
import type * as sourceFiles from "../sourceFiles.js";
import type * as streaming from "../streaming.js";
import type * as stripePlanSync from "../stripePlanSync.js";
import type * as studyFiles from "../studyFiles.js";
import type * as studyRag from "../studyRag.js";
import type * as usageLedger from "../usageLedger.js";
import type * as usageLedgerHelpers from "../usageLedgerHelpers.js";
import type * as users from "../users.js";
import type * as workflowControls from "../workflowControls.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminAccess: typeof adminAccess;
  apiRateLimits: typeof apiRateLimits;
  auditEvents: typeof auditEvents;
  billing: typeof billing;
  billingQueries: typeof billingQueries;
  crons: typeof crons;
  emails: typeof emails;
  exams: typeof exams;
  extractionStorage: typeof extractionStorage;
  http: typeof http;
  planLimits: typeof planLimits;
  posthog: typeof posthog;
  r2: typeof r2;
  rateLimits: typeof rateLimits;
  sourceFiles: typeof sourceFiles;
  streaming: typeof streaming;
  stripePlanSync: typeof stripePlanSync;
  studyFiles: typeof studyFiles;
  studyRag: typeof studyRag;
  usageLedger: typeof usageLedger;
  usageLedgerHelpers: typeof usageLedgerHelpers;
  users: typeof users;
  workflowControls: typeof workflowControls;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  persistentTextStreaming: import("@convex-dev/persistent-text-streaming/_generated/component.js").ComponentApi<"persistentTextStreaming">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  stripe: import("@convex-dev/stripe/_generated/component.js").ComponentApi<"stripe">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  posthog: import("@posthog/convex/_generated/component.js").ComponentApi<"posthog">;
};
