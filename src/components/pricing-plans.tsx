"use client";

import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { SignUpButton, useUser } from "@clerk/nextjs";
import { CheckoutButton, usePlans } from "@clerk/nextjs/experimental";
import { useEffect, useRef } from "react";
import { captureConversionEvent } from "@/lib/conversion-analytics";

type Plan = {
  name: string;
  slug: string;
  price: string;
  description: string;
  badge?: string;
  featured?: boolean;
  decision: string;
  ctaLabel: string;
  metrics: Array<{
    label: string;
    value: string;
  }>;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Pro",
    slug: "pro",
    price: "$35",
    description: "Best for steady exam prep with lecture PDFs, review files, and daily tutor use.",
    badge: "Most students",
    featured: true,
    decision: "Choose Pro if you study from a few major files each week.",
    ctaLabel: "Start Pro",
    metrics: [
      { label: "pages/month", value: "10k" },
      { label: "uploads/month", value: "100" },
      { label: "daily tutor chats", value: "500" },
    ],
    features: [
      "AI extraction from medical PDFs and exam banks",
      "Quiz mode, mock exams, and source review",
      "Source highlights for every generated question",
      "Up to 250 MB per file",
      "Four active extraction jobs",
    ],
  },
  {
    name: "Max",
    slug: "max",
    price: "$45",
    description: "For heavier blocks, dense note archives, and larger monthly upload volume.",
    decision: "Choose Max if you batch-process big folders before exams.",
    ctaLabel: "Start Max",
    metrics: [
      { label: "pages/month", value: "100k" },
      { label: "uploads/month", value: "500" },
      { label: "daily tutor chats", value: "2k" },
    ],
    features: [
      "Highest upload and processing allowance",
      "Advanced OCR and review workflows",
      "Bulk grammar cleanup",
      "Up to 500 MB per file",
      "Eight active extraction jobs",
    ],
  },
];

export function PricingPlans() {
  const { isLoaded, isSignedIn } = useUser();
  const plans = usePlans({ for: "user", pageSize: 20 });
  const clerkPlans = plans.data ?? [];
  const trackedViewRef = useRef(false);
  const billingCheckReady = isLoaded && !plans.isLoading;
  const billingUnavailable =
    billingCheckReady && (plans.isError || clerkPlans.length === 0);

  useEffect(() => {
    if (!billingCheckReady || trackedViewRef.current) return;
    trackedViewRef.current = true;
    captureConversionEvent("pricing_viewed", {
      signed_in: Boolean(isSignedIn),
      current_plan: "unknown",
      billing_available: !billingUnavailable,
      source_path: window.location.pathname,
    });
  }, [billingCheckReady, billingUnavailable, isSignedIn]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      {billingUnavailable ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Checkout is temporarily unavailable. The plans are shown below and checkout
          will unlock as soon as billing is available.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {PLANS.map((plan) => {
          const clerkPlan = clerkPlans.find((item) => item.slug === plan.slug);
          return (
            <section
              key={plan.slug}
              className={
                plan.featured
                  ? "relative rounded-lg border-2 border-slate-950 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
                  : "rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-950">
                      {plan.name}
                    </h2>
                    {plan.badge ? (
                      <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
                        {plan.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                    {plan.description}
                  </p>
                </div>
                <Sparkles
                  className={
                    plan.featured
                      ? "mt-1 size-5 shrink-0 text-amber-500"
                      : "mt-1 size-5 shrink-0 text-slate-400"
                  }
                />
              </div>

              <div className="mt-6 flex items-end gap-1 border-b border-slate-100 pb-5">
                <span className="text-5xl font-black tracking-tight text-slate-950">
                  {plan.price}
                </span>
                <span className="pb-1 text-sm font-semibold text-slate-500">/month</span>
              </div>

              <PlanAction
                ctaLabel={plan.ctaLabel}
                featured={Boolean(plan.featured)}
                isLoaded={isLoaded}
                isSignedIn={Boolean(isSignedIn)}
                planId={clerkPlan?.id}
                planSlug={plan.slug}
              />

              <div className="mt-5 grid grid-cols-3 gap-2">
                {plan.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-lg bg-slate-50 px-3 py-3"
                  >
                    <p className="text-xl font-black text-slate-950">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase leading-4 text-slate-500">
                      {metric.label}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold leading-5 text-emerald-900">
                {plan.decision}
              </p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-700">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PlanAction({
  ctaLabel,
  featured,
  isLoaded,
  isSignedIn,
  planId,
  planSlug,
}: {
  ctaLabel: string;
  featured: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  planId?: string;
  planSlug: string;
}) {
  const className =
    featured
      ? "mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      : "mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-slate-950 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:ring-slate-200";

  if (!isLoaded) {
    return <button type="button" className={className} disabled>Loading checkout</button>;
  }

  if (!isSignedIn) {
    return (
      <SignUpButton mode="modal" fallbackRedirectUrl="/pricing">
        <button
          type="button"
          className={className}
          onClick={() => {
            captureConversionEvent("plan_cta_clicked", {
              plan_slug: planSlug,
              signed_in: false,
              surface: "pricing_card",
            });
            captureConversionEvent("signup_cta_clicked", {
              plan_intent: planSlug,
              surface: "pricing_card",
            });
            captureConversionEvent("signup_started", {
              plan_intent: planSlug,
              surface: "pricing_card",
            });
          }}
        >
          {ctaLabel}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </SignUpButton>
    );
  }

  if (!planId) {
    return (
      <Link
        href="/support"
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        onClick={() => {
          captureConversionEvent("support_contact_clicked", {
            path: "/pricing",
            reason: "billing_unavailable",
            plan_intent: planSlug,
          });
        }}
      >
        Contact support
      </Link>
    );
  }

  return (
    <CheckoutButton
      for="user"
      planId={planId}
      planPeriod="month"
      newSubscriptionRedirectUrl={`/dashboard?checkout=success&plan=${encodeURIComponent(planSlug)}`}
    >
      <button
        type="button"
        className={className}
        onClick={() => {
          captureConversionEvent("plan_cta_clicked", {
            plan_slug: planSlug,
            signed_in: true,
            surface: "pricing_card",
          });
          captureConversionEvent("checkout_started", {
            plan_slug: planSlug,
            plan_period: "month",
            source_path: "/pricing",
          });
        }}
      >
        {ctaLabel}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </CheckoutButton>
  );
}
