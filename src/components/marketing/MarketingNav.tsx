"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#example", label: "Example emails" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-600 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-ink-900">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href="/dashboard" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/onboarding" size="sm">
            Start free
          </ButtonLink>
        </div>
        <button type="button" className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 md:hidden" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <div className="rise border-t border-ink-100 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex gap-2">
            <ButtonLink href="/dashboard" variant="outline" className="flex-1">
              Sign in
            </ButtonLink>
            <ButtonLink href="/onboarding" className="flex-1">
              Start free
            </ButtonLink>
          </div>
        </div>
      ) : null}
      {open ? <Link href="/" className="sr-only">Home</Link> : null}
    </header>
  );
}
