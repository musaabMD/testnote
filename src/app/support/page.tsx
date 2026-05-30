import type { Metadata } from "next";
import Link from "next/link";
import { Bug, GraduationCap, Lightbulb, Mail, MessageSquare } from "lucide-react";
import { PublicHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Support | DrNote",
  description:
    "Contact DrNote support for upload issues, billing questions, exam requests, and product feedback.",
  alternates: {
    canonical: "/support",
  },
};

const supportOptions = [
  {
    title: "Ask a question",
    text: "Use the support chat button in the corner for product, upload, or study workflow questions.",
    icon: MessageSquare,
  },
  {
    title: "Report an issue",
    text: "Include what you uploaded, what you expected, and the page or mode where the issue happened.",
    icon: Bug,
  },
  {
    title: "Suggest an exam",
    text: "Send the exam name, country, school, or specialty so coverage can be reviewed.",
    icon: GraduationCap,
  },
  {
    title: "Request a feature",
    text: "Describe the studying workflow it improves and whether it blocks your current prep.",
    icon: Lightbulb,
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicHeader />
      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-12 sm:px-10 lg:grid-cols-[0.85fr_1.15fr] lg:py-16">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.08em] text-emerald-700">
            DrNote support
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-sora)] text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
            Get help with uploads, billing, and study workflows.
          </h1>
          <p className="mt-5 max-w-xl text-base font-medium leading-8 text-slate-600 sm:text-lg">
            Send a message from the support widget, or email the team if you
            need to include account or billing context.
          </p>
          <Link
            href="mailto:support@drnote.co"
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
          >
            <Mail className="size-4" aria-hidden />
            support@drnote.co
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {supportOptions.map((option) => {
            const Icon = option.icon;
            return (
              <article
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                key={option.title}
              >
                <Icon className="size-5 text-emerald-700" aria-hidden />
                <h2 className="mt-4 text-base font-black text-slate-950">
                  {option.title}
                </h2>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                  {option.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
