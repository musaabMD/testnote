# Signup and Upgrade Conversion Metrics

This document defines the operating metrics for improving DrNote/TestNote signup and paid-plan conversion. It is written as a working growth dashboard spec: measure every step, compare it against the target, and run the correction plan when the number falls short.

## Primary Goal

Increase the share of qualified visitors who become paying users without weakening product trust, launch safety, or AI cost controls.

Primary funnel:

`visitor -> signup started -> signup completed -> first successful upload/extraction -> study action -> pricing viewed -> checkout started -> paid plan active`

## Measurement Rules

- Count users, not sessions, for signup, activation, and upgrade rates.
- Attribute each paid conversion to the first meaningful source within a 30-day lookback.
- Separate signed-out public visitors from signed-in users.
- Separate organic, direct, referral, paid, and launch/community traffic.
- Track Pro and Max separately because price sensitivity and usage intent will differ.
- Exclude internal/admin users, test cards, localhost, staging, and known QA accounts.
- Report weekly rolling numbers for product decisions and daily numbers for launch monitoring.
- Treat conversion improvements as invalid if refund rate, cancellation rate, AI cost margin, or support burden materially worsens.

## Required Event Map

| Event | Trigger | Important properties |
|---|---|---|
| `landing_viewed` | Public homepage loaded | `path`, `referrer`, `utm_source`, `utm_campaign`, `device`, `country` |
| `homepage_upload_clicked` | Visitor starts the public upload/dropzone flow | `signed_in`, `file_type`, `source_path` |
| `signup_cta_clicked` | Any signup CTA clicked | `path`, `cta_label`, `surface` |
| `signup_started` | Clerk signup modal/page opens | `path`, `surface`, `plan_intent` |
| `signup_completed` | Clerk user created and app receives signed-in user | `method`, `path`, `surface` |
| `first_upload_started` | New user starts first upload | `file_type`, `file_size_mb`, `page_count`, `source_path` |
| `first_extraction_completed` | First extraction job succeeds | `duration_seconds`, `question_count`, `page_count`, `used_cache`, `plan` |
| `first_extraction_failed` | First extraction job fails | `failure_reason`, `file_type`, `page_count`, `plan` |
| `study_action_completed` | First quiz, flashcard, source view, mock exam, or tutor action | `action_type`, `question_count`, `plan` |
| `pricing_viewed` | `/pricing` loaded | `signed_in`, `current_plan`, `billing_available`, `source_path` |
| `plan_cta_clicked` | Pro or Max CTA clicked | `plan_slug`, `signed_in`, `billing_available`, `surface` |
| `checkout_started` | Clerk checkout opens | `plan_slug`, `plan_period`, `source_path` |
| `checkout_completed` | Clerk redirects after successful checkout | `plan_slug`, `plan_period`, `amount_usd` |
| `billing_synced_active` | Convex user row becomes active paid plan | `plan`, `billing_status`, `source` |
| `quota_limit_seen` | User sees quota/plan limit banner | `limit_type`, `plan`, `surface`, `remaining` |
| `quota_upgrade_clicked` | User clicks upgrade from quota banner | `limit_type`, `plan`, `surface` |
| `billing_inactive_seen` | Canceled/past-due user sees billing banner | `billing_status`, `plan`, `surface` |
| `support_contact_clicked` | Billing unavailable or user clicks support | `path`, `reason`, `plan_intent` |
| `subscription_canceled` | Clerk webhook marks subscription canceled | `plan`, `tenure_days`, `reason` |
| `refund_issued` | Refund is issued | `plan`, `amount_usd`, `reason` |

Current code already has optional PostHog wiring and `source_view` telemetry. The events above should be added before optimizing conversion so the team can distinguish real product friction from traffic-quality issues.

Client-side events require `NEXT_PUBLIC_POSTHOG_KEY` and optional `NEXT_PUBLIC_POSTHOG_HOST`. Server-side billing sync events use `POSTHOG_API_KEY` and optional `POSTHOG_HOST`.

## North Star Metrics

| Metric | Formula | Starting target | If short, correction plan |
|---|---:|---:|---|
| Qualified signup conversion | `signup_completed / qualified_landing_viewed` | 8-12% | Tighten homepage promise around the highest-intent use case: upload medical PDFs and get exam-ready questions. Move proof, sample output, and signup/upload entry closer to first viewport. |
| Activated signup rate | `first_extraction_completed / signup_completed` | 55-70% | Reduce first-upload friction, make supported file rules explicit, improve upload error copy, and add a sample file/demo path for users without a file ready. |
| Study action rate | `study_action_completed / first_extraction_completed` | 60-75% | After extraction, route users directly into the best next action: quiz mode, source review, or mock exam. Avoid leaving users on a passive result screen. |
| Paid conversion from activated users | `billing_synced_active / activated_users` | 8-15% | Add value-based upgrade prompts at natural moments: after successful extraction, after source-backed answer review, and when users hit meaningful limits. |
| Quota-banner upgrade rate | `billing_synced_active after quota_limit_seen / quota_limit_seen` | 12-25% | Rewrite quota banners around the work the user is trying to finish, show exact unlocked capacity, and send users directly to the relevant plan. |
| Checkout completion rate | `checkout_completed / checkout_started` | 70-85% | Fix billing availability, plan slug mapping, trust copy, payment errors, redirect behavior, and mobile checkout usability. |
| Active paid sync rate | `billing_synced_active / checkout_completed` | 99%+ | Treat any gap as a launch blocker. Verify Clerk webhook secret, production webhook URL, Convex plan mapping, and billing status transitions. |
| Paid user first-value rate | `first_extraction_completed after payment / billing_synced_active` | 80%+ | After checkout, redirect to `/dashboard` with a clear upload action, preserve the pre-checkout intent, and avoid dead-end billing screens. |

## Full Funnel Metrics

### Acquisition and Visitor Quality

| Metric | Formula | Target | Shortfall signal | Correction plan |
|---|---:|---:|---|---|
| Unique visitors | Count of unique public visitors | Trend upward weekly | Traffic flat or low | Publish targeted exam-prep pages, improve SEO metadata, and distribute demos to high-intent study communities. |
| Qualified visitor share | Visitors from target keywords, exam pages, referrals, or returning users / all visitors | 50%+ | Lots of low-intent traffic | Narrow messaging, landing pages, and campaigns to medical exam prep users with PDFs or question banks. |
| Public page bounce rate | Single-page visitors / landing visitors | <55% | Visitors leave before acting | Put product output, upload entry, pricing trust, and supported file types above long feature browsing. |
| Homepage upload intent rate | `homepage_upload_clicked / landing_viewed` | 15-25% | Visitors do not try the core action | Make the upload component visually dominant, clarify supported inputs, and add a sample document CTA. |
| Pricing view rate | `pricing_viewed / landing_viewed` | 8-15% | Users do not explore plans | Add clearer pricing navigation near moments of value and uncertainty, not only in the header. |
| Signup CTA click rate | `signup_cta_clicked / landing_viewed` | 10-18% | Low CTA interest | Match CTA labels to the actual job: “Upload a PDF” or “Create my quiz,” not generic account language. |

### Signup

| Metric | Formula | Target | Shortfall signal | Correction plan |
|---|---:|---:|---|---|
| Signup start rate | `signup_started / landing_viewed` | 10-18% | CTA is not compelling | Show example output, exam use cases, and reduce generic marketing copy. |
| Signup completion rate | `signup_completed / signup_started` | 75-90% | Clerk modal/page abandonment | Shorten signup path, test social auth ordering, ensure modal opens reliably, and preserve redirect intent. |
| Signup error rate | `signup_errors / signup_started` | <2% | Users cannot create account | Capture Clerk error codes, check domain/auth config, and add support fallback for repeated failures. |
| New user dashboard arrival rate | `dashboard_viewed / signup_completed` | 90%+ | Redirect is weak or broken | Verify `fallbackRedirectUrl`, middleware/proxy auth behavior, and post-signup routing. |
| Time to first upload | Median time from `signup_completed` to `first_upload_started` | <3 minutes | Users stall after signup | Put upload as the primary dashboard action and add a “try sample” path. |

### Activation

| Metric | Formula | Target | Shortfall signal | Correction plan |
|---|---:|---:|---|---|
| First upload start rate | `first_upload_started / signup_completed` | 65-80% | Users do not know what to do | Make upload the default signed-in state, show accepted files and max size, and reduce navigation choices. |
| First extraction success rate | `first_extraction_completed / first_upload_started` | 85-95% | Product reliability blocks value | Prioritize extraction failures by reason, reject unsupported files clearly, and improve queue/job status visibility. |
| Time to first extraction | Median time from `first_upload_started` to `first_extraction_completed` | <90 seconds for typical files | Slow value delivery | Add progress stages, use cache where possible, optimize extraction path, and set expectations by file size. |
| Question yield rate | Extractions with useful question count / successful extractions | 80%+ | Output feels weak | Improve extraction prompts, validation, chunking, OCR fallback, and source mapping. |
| Source trust rate | `source_view / first_extraction_completed` | 40-60% | Users do not verify answers | Surface source-backed review immediately after extraction and label source highlights clearly. |
| First quiz/mock exam rate | `quiz_started or mock_exam_started / first_extraction_completed` | 45-65% | Users stop after extraction | Add a primary “Start quiz” action after generation and remember preferred study mode. |
| Tutor first-use rate | `first_tutor_message / first_extraction_completed` | 15-30% | Tutor value unclear | Place contextual tutor prompts beside confusing questions instead of presenting tutor as a separate feature. |

### Upgrade Intent

| Metric | Formula | Target | Shortfall signal | Correction plan |
|---|---:|---:|---|---|
| Pricing page conversion to CTA | `plan_cta_clicked / pricing_viewed` | 20-35% | Plan value is unclear | Show exact plan limits from Clerk/Convex source of truth, compare Pro vs Max by study workload, and remove vague benefits. |
| Signed-out pricing signup rate | `signup_completed / signed_out_pricing_viewed` | 12-25% | Users are interested but not ready | Let users preview output before account creation or provide sample output on pricing. |
| Signed-in pricing checkout rate | `checkout_started / signed_in_pricing_viewed` | 25-45% | Paid value is not strong enough | Add usage-based plan recommendations and show what the current user has already achieved. |
| Pro CTA share | `pro_plan_cta_clicked / all_plan_cta_clicked` | 60-80% | Users hesitate between plans | Keep Pro as the obvious default and position Max for heavy upload volume only. |
| Max upgrade intent | `max_plan_cta_clicked / all_plan_cta_clicked` | 20-40% | Heavy users do not see why Max exists | Quantify Max benefits: larger uploads, more extraction allowance, denser OCR workflows, and expanded tutor usage. |
| Upgrade from limit rate | `quota_upgrade_clicked / quota_limit_seen` | 20-40% | Limit banners annoy but do not convert | Show the blocked action, the plan that unlocks it, and one direct CTA. Avoid generic upgrade copy. |
| Billing unavailable fallback rate | `support_contact_clicked / pricing_viewed when billing_unavailable` | 8%+ | Users cannot buy and do not contact | Make support fallback prominent and capture plan intent in the support path. |

### Checkout and Billing

| Metric | Formula | Target | Shortfall signal | Correction plan |
|---|---:|---:|---|---|
| Checkout start rate | `checkout_started / plan_cta_clicked` | 85-95% | CTA click does not open checkout | Verify Clerk plan IDs, `usePlans`, `CheckoutButton`, billing availability, and signed-in state handling. |
| Checkout completion rate | `checkout_completed / checkout_started` | 70-85% | Payment abandonment | Inspect Clerk checkout errors, mobile flow, payment methods, price objections, and redirect reliability. |
| Webhook sync success | `billing_synced_active / checkout_completed` | 99%+ | Paid users not unlocked | Fix `CLERK_WEBHOOK_SIGNING_SECRET`, webhook endpoint, event parser, and Convex plan slug mapping before paid launch. |
| Checkout-to-dashboard arrival | `dashboard_viewed after checkout / checkout_completed` | 90%+ | Users lose momentum after payment | Preserve redirect to `/dashboard`, show upload action, and confirm active plan state. |
| Payment failure rate | `payment_failed / checkout_started` | <8% | Payment friction or card issues | Add alternate payment method guidance and support path; verify Clerk Billing configuration. |
| Refund rate | `refund_issued / checkout_completed` | <5% | Buyers feel misled | Align pricing copy with actual limits, improve trial/demo expectations, and fix the top refund reasons. |

### Revenue and Plan Health

| Metric | Formula | Target | Shortfall signal | Correction plan |
|---|---:|---:|---|---|
| New MRR | Sum of new active subscription monthly value | Up weekly | Paid conversion or traffic weak | Diagnose whether the bottleneck is visitor volume, activation, pricing, or checkout. |
| Net MRR | New + expansion - contraction - churn MRR | Up weekly | Growth leaks after acquisition | Improve retention, address cancellations, and reduce payment failures. |
| ARPPU | Paid subscription revenue / active paid users | Near intended plan mix | Too many low-fit users or discounts | Keep Pro default, reserve discounts for campaigns with measured retention. |
| Upgrade MRR from Max | Max MRR / total MRR | 20-40% | Heavy users stay on Pro or churn | Trigger Max recommendations based on actual page, file, OCR, and tutor usage. |
| Gross margin after AI cost | `(revenue - AI/storage/provider cost) / revenue` | 70%+ | Paid usage is unprofitable | Adjust limits, caching, model routing, and Max positioning before increasing acquisition spend. |
| AI cost per activated user | AI cost / activated users | Within plan budget | Activation burns too much cost | Improve duplicate detection, caching, file caps, and preflight validation. |
| Support contacts per paid user | Billing/support contacts / active paid users | <8% monthly | Confusing product or billing | Fix the source of repeated questions in UI copy and onboarding. |

### Retention and Expansion

| Metric | Formula | Target | Shortfall signal | Correction plan |
|---|---:|---:|---|---|
| D1 activated retention | Users active day after activation / activated users | 35-50% | First value is not sticky | Send users back to unfinished study sets, recent exams, and next quiz actions. |
| D7 activated retention | Users active 7 days after activation / activated users | 20-35% | Study habit does not form | Add session history, reminders, stronger exam workflows, and clearer progress. |
| Weekly paid active rate | Paid users with study action this week / active paid users | 55-75% | Paid users are idle | Improve dashboard recency, saved files, and next best action. |
| Monthly churn | Canceled paid users / paid users at period start | <6-8% | Product does not justify recurring price | Segment cancellations by activation, usage, output quality, and price objection. |
| Past-due recovery rate | Recovered active subscriptions / past-due subscriptions | 40-60% | Payment failures become churn | Improve billing update prompts and Clerk dunning configuration. |
| Expansion rate | Users moving Pro -> Max / eligible heavy Pro users | 8-15% | Max is not compelling | Trigger Max prompts only for users blocked by actual heavy usage. |

## Shortfall Playbooks

### If Landing to Signup Is Short

Symptoms:

- Low `signup_started / landing_viewed`.
- Low `homepage_upload_clicked / landing_viewed`.
- High public-page bounce rate.

Corrections:

1. Put the upload action and a concrete output preview before secondary feature grids.
2. Replace broad feature language with the strongest user job: medical PDFs and exam banks into reviewable questions.
3. Add sample output for users who do not have a file ready.
4. Make supported file types, privacy posture, and expected processing time visible near upload.
5. Create targeted pages for top exam/search intents instead of sending all traffic to the homepage.

### If Signup Starts but Does Not Complete

Symptoms:

- Low `signup_completed / signup_started`.
- Elevated Clerk errors.
- Users return to public pages after auth.

Corrections:

1. Audit Clerk modal reliability, social auth ordering, and mobile signup.
2. Preserve the intent that caused signup, especially upload and pricing intent.
3. Verify post-signup redirect to dashboard or the original action.
4. Track and fix auth error codes before testing copy changes.

### If Users Sign Up but Do Not Activate

Symptoms:

- Low `first_upload_started / signup_completed`.
- Low `first_extraction_completed / signup_completed`.
- Long time to first upload.

Corrections:

1. Make upload the first signed-in screen, not a secondary navigation choice.
2. Add a sample file path so users can experience value immediately.
3. Clarify upload limits and unsupported DOC/DOCX behavior before upload.
4. Improve extraction progress states and failure recovery.
5. Route successful extraction into quiz/source review instead of leaving users to decide from scratch.

### If Activation Is High but Upgrades Are Low

Symptoms:

- Healthy extraction and study rates.
- Low `pricing_viewed / activated_users`.
- Low `billing_synced_active / activated_users`.

Corrections:

1. Add upgrade prompts after value moments, not before users understand the product.
2. Show plan recommendations based on actual usage: pages, files, OCR, tutor messages, and active extraction needs.
3. Make Pro the default path and reserve Max for visibly heavy workflows.
4. Quantify the unlocked capacity instead of listing vague premium benefits.
5. Test annual pricing only after monthly checkout and billing sync are stable.

### If Pricing Views Do Not Become Checkout Starts

Symptoms:

- Low `plan_cta_clicked / pricing_viewed`.
- Low `checkout_started / plan_cta_clicked`.
- High support clicks from pricing.

Corrections:

1. Reconcile Clerk Billing plan slugs, visible pricing, and Convex enforced limits.
2. Show the same plan names and limits everywhere: pricing, quota banners, support, and internal docs.
3. Remove or rewrite benefits that are not live.
4. Add concise trust copy: source-backed answers, clear limits, cancellation path, support email.
5. Verify billing availability before driving traffic to pricing.

### If Checkout Starts but Does Not Complete

Symptoms:

- Low `checkout_completed / checkout_started`.
- Payment errors or checkout abandonment.
- Mobile checkout drop-off.

Corrections:

1. Inspect Clerk checkout error states and payment method availability.
2. Test checkout on mobile, Safari, Chrome, and signed-in/signed-out flows.
3. Confirm redirect URLs and dashboard arrival after payment.
4. Add support fallback for failed checkout attempts.
5. Review price-value fit only after technical checkout issues are ruled out.

### If Paid Users Are Not Unlocked

Symptoms:

- `checkout_completed` exists but `billing_synced_active` is missing.
- User paid but remains on free limits.
- Canceled or past-due status is wrong.

Corrections:

1. Treat as P0.
2. Verify production `CLERK_WEBHOOK_SIGNING_SECRET`.
3. Verify Clerk webhook URL points to `https://www.drnote.co/api/webhooks/clerk`.
4. Verify webhook events are received and parsed by `parseClerkBillingWebhook`.
5. Verify Convex `users.plan` and `billingStatus` update correctly.
6. Verify plan slugs map to the intended Convex profiles.
7. Do not run paid acquisition until this is proven with real subscription lifecycle tests.

### If Paid Users Churn or Refund

Symptoms:

- High refund rate.
- Monthly churn above target.
- Paid users do not complete extractions after payment.

Corrections:

1. Segment churn by no activation, extraction failure, price objection, output quality, and billing confusion.
2. Fix top failure reasons before adding more acquisition.
3. Add post-checkout onboarding that gets users back to the file or study action that motivated payment.
4. Align pricing copy with actual backend limits.
5. Add cancellation reason capture and review weekly.

## Weekly Review Template

Use this every week until signup and upgrade rates stabilize.

| Funnel step | Current | Target | Status | Biggest observed drop-off | Decision |
|---|---:|---:|---|---|---|
| Qualified visitors | TBD | Up weekly | TBD | TBD | TBD |
| Signup completion | TBD | 8-12% of qualified visitors | TBD | TBD | TBD |
| Activation | TBD | 55-70% of signups | TBD | TBD | TBD |
| Study action | TBD | 60-75% of activated users | TBD | TBD | TBD |
| Pricing CTA | TBD | 20-35% of pricing views | TBD | TBD | TBD |
| Checkout completion | TBD | 70-85% of checkout starts | TBD | TBD | TBD |
| Billing sync | TBD | 99%+ of completed checkouts | TBD | TBD | TBD |
| Paid first value | TBD | 80%+ of active paid users | TBD | TBD | TBD |
| Refunds/churn | TBD | Refund <5%, churn <6-8% monthly | TBD | TBD | TBD |

## Implementation Priority

1. Add the required events and exclude internal/test traffic.
2. Build a PostHog dashboard with the primary funnel and plan split.
3. Prove checkout and Convex billing sync with real Clerk Billing lifecycle tests.
4. Optimize activation before optimizing pricing copy.
5. Optimize pricing and quota prompts once activation is reliable.
6. Review refund, churn, support, and AI-cost margin before increasing acquisition spend.
