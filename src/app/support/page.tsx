import { Mail, MessageCircle, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Support - DrNote",
  description: "Contact DrNote support for billing, account, and study-file help.",
  alternates: {
    canonical: "/support",
  },
};

const supportOptions = [
  {
    title: "Billing and plans",
    description: "Plan setup, Clerk Billing questions, invoices, and launch pricing.",
    subject: "Billing support",
    icon: ShieldCheck,
  },
  {
    title: "Study files",
    description: "Upload failures, extraction quality, source previews, and quiz behavior.",
    subject: "Study file support",
    icon: MessageCircle,
  },
  {
    title: "Account help",
    description: "Sign-in issues, dashboard access, and saved library questions.",
    subject: "Account support",
    icon: Mail,
  },
];

function supportMailto(subject: string) {
  const params = new URLSearchParams({
    subject: `DrNote: ${subject}`,
    body: "Tell us what happened, the page URL, your account email, and any file name involved.",
  });
  return `mailto:support@drnote.co?${params.toString()}`;
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-white font-[family-name:var(--font-dm-sans)] text-slate-950">
      <PublicHeader />

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-sky-600">
            Support
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-sora)] text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            Get help with DrNote
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-500">
            Use the support queue for production issues, billing questions, upload failures,
            and account access. Include the page URL and account email so the issue can be
            traced quickly.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {supportOptions.map((option) => {
            const Icon = option.icon;
            return (
              <a
                key={option.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white"
                href={supportMailto(option.subject)}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-white text-sky-600">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-base font-black text-slate-950">
                  {option.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {option.description}
                </p>
              </a>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-black text-slate-950">Direct contact</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Email{" "}
            <a
              className="font-bold text-slate-700 underline-offset-2 hover:underline"
              href="mailto:support@drnote.co"
            >
              support@drnote.co
            </a>
            . For urgent paid-launch issues, include urgent in the subject.
          </p>
          <Link
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
            href="/dashboard"
          >
            Open dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
