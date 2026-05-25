# Clerk Billing to Convex Verification

Use this checklist before the first paid sale. Clerk Billing owns visible plans and checkout; Convex owns quota enforcement.

## Plan Alignment

| Clerk Billing plan slug | Expected Convex plan | Convex profile | Clerk visible limits | Match? | Notes |
|-------------------------|----------------------|----------------|----------------------|--------|-------|
| `starter` | `starter` | `convex/planLimits.ts` starter | TBD in Clerk Dashboard | Pending | Do not advertise limits above backend caps. |
| `pro` | `pro` | `convex/planLimits.ts` pro | TBD in Clerk Dashboard | Pending | Highlighted plan defaults to `pro`. |
| `max` | `school` interim | `convex/planLimits.ts` school | TBD in Clerk Dashboard | Pending | Rename/reconcile before launch if `max` remains public. |
| `teams` | `school` interim | `convex/planLimits.ts` school | TBD in Clerk Dashboard | Pending | Confirm team billing behavior before offering publicly. |

## Staging Events

| Scenario | Expected Convex result | Actual result | Pass/fail | Date | Owner |
|----------|------------------------|---------------|-----------|------|-------|
| New free user signs in | `users.plan=free`, free limits set | Pending | Pending | TBD | TBD |
| User starts starter plan | `users.plan=starter`, starter limits set | Pending | Pending | TBD | TBD |
| User starts pro plan | `users.plan=pro`, pro limits set | Pending | Pending | TBD | TBD |
| User starts max/team plan | `users.plan=school` until renamed | Pending | Pending | TBD | TBD |
| Subscription canceled or inaccessible | Expensive AI jobs blocked or downgraded per policy | Pending | Pending | TBD | TBD |
| Past-due billing state | Expensive AI jobs blocked or downgraded per policy | Pending | Pending | TBD | TBD |

## Required Evidence

- Screenshot or export of Clerk Billing plan slugs, prices, and visible limits.
- Convex user row before and after each plan transition.
- Successful quota block when a test user exceeds the target limit.
- `appAuditEvents` entries for quota/rate-limit failures.
- `npm run lint` passing on the release branch.
