"use client";

import { Check, Sparkles } from "lucide-react";
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
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Pro",
    slug: "pro",
    price: "$35",
    description: "For students converting lecture PDFs and exam banks into daily practice.",
    badge: "Best fit",
    features: [
      "AI extraction from medical PDFs",
      "Quiz mode, mock exam, and source review",
      "Tutor chat for explanations",
      "Source highlights for every question",
      "Priority extraction limits",
    ],
  },
  {
    name: "Max",
    slug: "max",
    price: "$45",
    description: "For heavy exam prep, dense notes, and larger monthly upload volume.",
    features: [
      "Higher upload and processing allowance",
      "Advanced OCR and review workflows",
      "Bulk grammar cleanup",
      "Better support for dense study files",
      "Expanded tutor usage",
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
    <div className="mx-auto w-full max-w-5xl">
      {billingUnavailable ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Checkout is temporarily unavailable. The plans are shown below and checkout
          will unlock as soon as billing is available.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => {
          const clerkPlan = clerkPlans.find((item) => item.slug === plan.slug);
          return (
            <section
              key={plan.slug}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
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
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {plan.description}
                  </p>
                </div>
                <Sparkles className="mt-1 size-5 shrink-0 text-slate-400" />
              </div>

              <div className="mt-6 flex items-end gap-1">
                <span className="text-4xl font-black text-slate-950">
                  {plan.price}
                </span>
                <span className="pb-1 text-sm font-semibold text-slate-500">/month</span>
              </div>

              <PlanAction
                isLoaded={isLoaded}
                isSignedIn={Boolean(isSignedIn)}
                planId={clerkPlan?.id}
                planName={plan.name}
                planSlug={plan.slug}
              />

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
  isLoaded,
  isSignedIn,
  planId,
  planName,
  planSlug,
}: {
  isLoaded: boolean;
  isSignedIn: boolean;
  planId?: string;
  planName: string;
  planSlug: string;
}) {
  const className =
    "mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300";

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
          Start {planName}
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
        Start {planName}
      </button>
    </CheckoutButton>
  );
}
