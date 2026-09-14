"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, FileText, Plus, Settings, Menu, X, CalendarClock } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { useAppStore } from "@/lib/store/useAppStore";
import { planById } from "@/lib/constants";
import { formatLong, todayISO } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const account = useAppStore((s) => s.account);
  const simulatedDate = useAppStore((s) => s.simulatedDate);
  const resetClock = useAppStore((s) => s.resetClock);

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            isActive(href) ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
          )}
        >
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );

  const accountPanel = account ? (
    <div className="rounded-xl border border-ink-200 bg-white p-3.5">
      <p className="truncate text-sm font-semibold text-ink-900">{account.business.name}</p>
      <p className="truncate text-xs text-ink-500">{account.business.email}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <Badge tone="brand">{planById(account.subscription.plan).name}</Badge>
        <Badge tone="neutral">Demo mode</Badge>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-200 bg-white px-4 py-5 lg:flex">
        <Logo href="/dashboard" className="px-2" />
        <div className="mt-7">
          <ButtonLink href="/quotes/new" className="w-full" icon={<Plus className="h-4 w-4" />}>
            Add quote
          </ButtonLink>
        </div>
        <div className="mt-6">{nav}</div>
        <div className="mt-auto space-y-3">
          {accountPanel}
          <Link href="/" className="block px-2 text-xs text-ink-400 hover:text-ink-600">
            ← Back to website
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:h-auto lg:justify-end lg:py-2.5">
          <div className="flex items-center gap-3 lg:hidden">
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-700 hover:bg-ink-100" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <Logo href="/dashboard" />
          </div>
          <div className="flex items-center gap-2">
            {simulatedDate ? (
              <button
                type="button"
                onClick={resetClock}
                className="hidden items-center gap-1.5 rounded-full border border-warning-100 bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700 hover:bg-warning-100 sm:inline-flex"
                title="Click to return to the real date"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Simulating {formatLong(simulatedDate)}
              </button>
            ) : (
              <span className="hidden text-xs text-ink-400 sm:inline">{formatLong(todayISO())}</span>
            )}
            <ButtonLink href="/quotes/new" size="sm" className="lg:hidden" icon={<Plus className="h-4 w-4" />}>
              Add quote
            </ButtonLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-ink-950/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="rise absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-4 py-5 shadow-float">
            <div className="flex items-center justify-between px-2">
              <Logo href="/dashboard" />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-600 hover:bg-ink-100" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6">{nav}</div>
            <div className="mt-auto">{accountPanel}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
