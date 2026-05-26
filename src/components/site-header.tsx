"use client";

import { UserButton, useClerk, useUser } from "@clerk/nextjs";
import { ChevronRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_LOGO_URL, APP_NAME } from "@/lib/site-branding";

const NAV_LINKS = [
  { label: "Exams", href: "/exams" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
];

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const DASHBOARD_HREF = "/dashboard";

type SiteHeaderProps = {
  showNav?: boolean;
  showDashboardCta?: boolean;
  showUserAvatar?: boolean;
};

type HeaderActionsProps = {
  layout?: "desktop" | "mobile";
  onAction?: () => void;
};

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={APP_NAME}>
      <Image
        alt={APP_NAME}
        className="size-[34px] rounded-xl object-contain"
        height={34}
        unoptimized
        src={APP_LOGO_URL}
        width={34}
      />
      <span className="font-[family-name:var(--font-sora)] text-[19px] font-black tracking-tight text-slate-950">
        {APP_NAME}
      </span>
    </Link>
  );
}

function getSecondaryButtonClass(layout: HeaderActionsProps["layout"]) {
  return layout === "mobile"
    ? "flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
    : "inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950";
}

function getPrimaryButtonClass(layout: HeaderActionsProps["layout"]) {
  return layout === "mobile"
    ? "flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 text-sm font-bold text-white transition hover:bg-zinc-800"
    : "group inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-zinc-800 active:scale-[0.97]";
}

function LocalAuthActions({ layout = "desktop", onAction }: HeaderActionsProps) {
  return (
    <div
      className={
        layout === "mobile"
          ? "grid gap-2"
          : "flex shrink-0 items-center gap-2"
      }
    >
      <Link
        href={DASHBOARD_HREF}
        className={getSecondaryButtonClass(layout)}
        onClick={onAction}
      >
        Log in
      </Link>
      <Link
        href={DASHBOARD_HREF}
        className={getPrimaryButtonClass(layout)}
        onClick={onAction}
      >
        Sign up
      </Link>
    </div>
  );
}

function ClerkAuthActions({ layout = "desktop", onAction }: HeaderActionsProps) {
  const { openSignIn, openSignUp } = useClerk();
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div
        className={
          layout === "mobile"
            ? "h-11 w-full rounded-2xl bg-slate-100"
            : "h-9 w-36 rounded-full bg-slate-100"
        }
        aria-hidden
      />
    );
  }

  if (isSignedIn) {
    return (
      <div
        className={
          layout === "mobile"
            ? "flex items-center gap-3"
            : "flex shrink-0 items-center gap-3"
        }
      >
        <Link
          href={DASHBOARD_HREF}
          className={
            layout === "mobile"
              ? "flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-950 text-sm font-bold text-white transition hover:bg-zinc-800"
              : "group inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-zinc-800 active:scale-[0.97]"
          }
          onClick={onAction}
        >
          Dashboard
          <ChevronRight
            className="size-4 transition group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
        <UserButton />
      </div>
    );
  }

  return (
    <div
      className={
        layout === "mobile"
          ? "grid gap-2"
          : "flex shrink-0 items-center gap-2"
      }
    >
      <button
        type="button"
        className={getSecondaryButtonClass(layout)}
        onClick={() => {
          onAction?.();
          openSignIn({
            fallbackRedirectUrl: DASHBOARD_HREF,
            signUpFallbackRedirectUrl: DASHBOARD_HREF,
          });
        }}
      >
        Log in
      </button>
      <button
        type="button"
        className={getPrimaryButtonClass(layout)}
        onClick={() => {
          onAction?.();
          openSignUp({
            fallbackRedirectUrl: DASHBOARD_HREF,
            signInFallbackRedirectUrl: DASHBOARD_HREF,
          });
        }}
      >
        Sign up
      </button>
    </div>
  );
}

function HeaderActions(props: HeaderActionsProps) {
  if (!clerkEnabled) {
    return <LocalAuthActions {...props} />;
  }

  return <ClerkAuthActions {...props} />;
}

function SiteHeader({
  showNav = true,
  showDashboardCta = true,
  showUserAvatar = true,
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-[100] bg-white font-[family-name:var(--font-dm-sans)]">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-6">
        <Logo />

        {showNav ? (
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-3">
          {showUserAvatar && showDashboardCta ? (
            <div className="hidden sm:flex">
              <HeaderActions />
            </div>
          ) : null}

          {showNav ? (
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          ) : null}
        </div>
      </div>

      {showNav && menuOpen ? (
        <div className="bg-white px-6 pb-5 pt-2 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-2xl px-4 py-3 text-[15px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {showDashboardCta ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <HeaderActions
                  layout="mobile"
                  onAction={() => setMenuOpen(false)}
                />
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function PublicHeader() {
  return <SiteHeader showNav showDashboardCta />;
}

export function DashboardHeader() {
  return <SiteHeader showNav={false} showDashboardCta={false} showUserAvatar={false} />;
}
