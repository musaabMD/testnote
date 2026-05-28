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
    <section className="rounded-[28px] border-2 border-[#e5e5e5] bg-white px-4 py-5 text-center shadow-[0_5px_0_#e5e5e5] sm:px-6">
      <div className="grid justify-items-center gap-3">
        <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-[#e5e7eb] bg-[#f8fafc] text-2xl shadow-[0_3px_0_#d1d5db]"
            suppressHydrationWarning
          >
            {greeting.emoji}
          </span>
          <h2
            className="m-0 truncate text-[21px] font-black text-[#263238] sm:text-[24px]"
            suppressHydrationWarning
          >
            {greeting.salutation}, {userName}!
          </h2>
        </div>
        <blockquote className="min-w-0 max-w-[680px] px-2">
          {quote ? (
            <>
              <p className="text-sm font-black leading-6 text-[#4b4b4b] sm:text-[15px]">
                &ldquo;{quote.text}&rdquo;
              </p>
              <footer className="mt-1 text-xs font-black text-[#4b5563] sm:text-[13px]">
                - {quote.author}
              </footer>
            </>
          ) : (
            <div aria-hidden className="grid justify-items-center py-1">
              <div className="h-3 w-72 max-w-full rounded bg-[#e5e5e5]" />
              <div className="mt-1.5 h-2.5 w-24 rounded bg-[#e5e5e5]" />
            </div>
          )}
        </blockquote>
      </div>
    </section>
  );
}
