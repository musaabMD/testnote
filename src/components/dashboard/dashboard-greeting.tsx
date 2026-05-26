"use client";

import {
  getRandomLearningQuote,
  getTimeSalutation,
  type LearningQuote,
} from "@/lib/dashboard-greeting";
import { useEffect, useState } from "react";

type DashboardGreetingProps = {
  userName: string;
};

const DEFAULT_GREETING = { salutation: "Hello", emoji: "👋" };

export function DashboardGreeting({ userName }: DashboardGreetingProps) {
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [quote, setQuote] = useState<LearningQuote | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setGreeting(getTimeSalutation(new Date().getHours()));
      setQuote(getRandomLearningQuote());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section className="mb-8 text-center">
      <p
        aria-hidden
        className="m-0 text-4xl leading-none sm:text-5xl"
        suppressHydrationWarning
      >
        {greeting.emoji}
      </p>
      <h2
        className="m-0 mt-2 text-[28px] font-black tracking-tight text-slate-900 sm:text-[32px]"
        suppressHydrationWarning
      >
        {greeting.salutation}, {userName}!
      </h2>
      <blockquote className="mx-auto mt-5 max-w-xl rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-center sm:max-w-2xl sm:px-6 sm:py-5">
        {quote ? (
          <>
            <p className="text-base font-medium leading-relaxed text-blue-900 sm:text-lg">
              &ldquo;{quote.text}&rdquo;
            </p>
            <footer className="mt-2 text-sm font-semibold text-blue-700 sm:text-[15px]">
              — {quote.author}
            </footer>
          </>
        ) : (
          <div aria-hidden className="py-1">
            <div className="mx-auto h-5 w-4/5 rounded bg-blue-100/80" />
            <div className="mx-auto mt-3 h-4 w-1/3 rounded bg-blue-100/60" />
          </div>
        )}
      </blockquote>
    </section>
  );
}
