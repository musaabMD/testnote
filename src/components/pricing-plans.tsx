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
    description: "For most students: upload your files, make quizzes, and ask the tutor.",
    badge: "Best choice",
    featured: true,
    ctaLabel: "Upgrade to Pro",
    metrics: [
      { label: "pages/month", value: "10k" },
      { label: "uploads/month", value: "100" },
      { label: "daily tutor chats", value: "500" },
    ],
    features: [
      "Turn PDFs and exam banks into questions",
      "Practice with quizzes and mock exams",
      "Ask the AI tutor for explanations",
      "Up to 250 MB per file",
    ],
  },
  {
    name: "Max",
    slug: "max",
    price: "$45",
    description: "For big folders, dense archives, and exam-week bulk uploads.",
    ctaLabel: "Choose Max",
    metrics: [
      { label: "pages/month", value: "100k" },
      { label: "uploads/month", value: "500" },
      { label: "daily tutor chats", value: "2k" },
    ],
    features: [
      "Everything in Pro",
      "More room for bulk uploads",
      "Advanced OCR and grammar cleanup",
      "Up to 500 MB per file",
    ],
  },
];

const BENEFITS = [
  "Create study sets from your PDFs",
  "Exam-style questions with source highlights",
  "AI tutor explanations when you get stuck",
  "Mock exams and quiz review",
  "Faster answers while you study",
];

export function PricingPlans() {
  const { isLoaded, isSignedIn } = useUser();
  const plans = usePlans({ for: "user", pageSize: 20 });
  const clerkPlans = plans.data ?? [];
  const [proPlan, maxPlan] = PLANS;
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
        <div className="mx-auto mb-5 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Checkout is temporarily unavailable. The plans are shown below and checkout
          will unlock as soon as billing is available.
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">
          <Sparkles className="size-4" aria-hidden />
          Pro study upgrade
        </div>
        <h1 className="mt-5 text-3xl font-black leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
          Unlock everything with Pro.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
          One clear upgrade for students who want to turn study files into
          questions, explanations, and mock exams.
        </p>
      </div>

      <ul className="mx-auto mt-8 grid max-w-3xl gap-4 text-left sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <li
            key={benefit}
            className="flex min-w-0 items-start gap-3 text-[15px] font-semibold leading-7 text-slate-800 sm:text-base"
          >
            <Check className="mt-1 size-5 shrink-0 text-emerald-600" aria-hidden />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <section className="mx-auto mt-9 max-w-2xl rounded-lg border-2 border-slate-950 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.10)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-black text-slate-950">
                {proPlan.name}
              </h2>
              {proPlan.badge ? (
                <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
                  {proPlan.badge}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              {proPlan.description}
            </p>
          </div>
          <Sparkles className="mt-1 size-5 shrink-0 text-amber-500" aria-hidden />
        </div>

        <div className="mt-6 flex items-end gap-1">
          <span className="text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">
            {proPlan.price}
          </span>
          <span className="pb-2 text-sm font-semibold text-slate-500">/month</span>
        </div>

        <PlanAction
          ctaLabel={proPlan.ctaLabel}
          featured={Boolean(proPlan.featured)}
          isLoaded={isLoaded}
          isSignedIn={Boolean(isSignedIn)}
          planId={clerkPlans.find((item) => item.slug === proPlan.slug)?.id}
          planSlug={proPlan.slug}
        />

        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
          Includes {proPlan.metrics[0]?.value} pages/month,{" "}
          {proPlan.metrics[1]?.value} uploads/month, and{" "}
          {proPlan.metrics[2]?.value} tutor chats/day.
        </p>

        <ul className="mt-6 space-y-3">
          {proPlan.features.map((feature) => (
            <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-700">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto mt-4 flex max-w-2xl flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-slate-500">
            Need more room?
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Max is {maxPlan.price}/month
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {maxPlan.metrics[0]?.value} pages/month, {maxPlan.metrics[1]?.value}
            {" "}uploads/month, {maxPlan.metrics[2]?.value} tutor chats/day, and up
            to 500 MB per file.
          </p>
        </div>
        <div className="sm:w-52">
          <PlanAction
            compact
            ctaLabel={maxPlan.ctaLabel}
            featured={Boolean(maxPlan.featured)}
            isLoaded={isLoaded}
            isSignedIn={Boolean(isSignedIn)}
            planId={clerkPlans.find((item) => item.slug === maxPlan.slug)?.id}
            planSlug={maxPlan.slug}
          />
        </div>
      </section>
    </div>
  );
}

function PlanAction({
  compact = false,
  ctaLabel,
  featured,
  isLoaded,
  isSignedIn,
  planId,
  planSlug,
}: {
  compact?: boolean;
  ctaLabel: string;
  featured: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  planId?: string;
  planSlug: string;
}) {
  const spacing = compact ? "mt-0" : "mt-6";
  const className =
    featured
      ? `${spacing} inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300`
      : `${spacing} inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-slate-950 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:ring-slate-200`;

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
