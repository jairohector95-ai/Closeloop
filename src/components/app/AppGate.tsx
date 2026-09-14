"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { AppShell } from "./AppShell";

/**
 * Waits for local persistence to hydrate, then either renders the app shell
 * or sends the visitor to onboarding. Phase 2: swap this for a real auth check.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const mode = useAppStore((s) => s.mode);
  const hydrated = useAppStore((s) => s.hydrated);
  const hasAccount = useAppStore((s) => s.account !== null);
  const remoteStatus = useAppStore((s) => s.remoteStatus);
  const loadRemote = useAppStore((s) => s.loadRemote);

  useEffect(() => {
    if (mode === "cloud" && remoteStatus === "idle") void loadRemote();
  }, [mode, remoteStatus, loadRemote]);

  useEffect(() => {
    if (mode === "cloud") {
      if (remoteStatus === "unauthenticated") router.replace("/login");
      else if (remoteStatus === "ready" && !hasAccount) router.replace("/onboarding");
      return;
    }
    if (hydrated && !hasAccount) router.replace("/onboarding");
  }, [mode, remoteStatus, hydrated, hasAccount, router]);

  if (mode === "cloud" && remoteStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
        <div className="max-w-sm rounded-2xl border border-ink-200 bg-white p-6 text-center shadow-card">
          <p className="font-semibold text-ink-900">We couldn&apos;t load your workspace.</p>
          <p className="mt-1 text-sm text-ink-500">Check your connection, then try again.</p>
          <button type="button" onClick={() => void loadRemote()} className="mt-4 rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-white">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!hydrated || !hasAccount || (mode === "cloud" && remoteStatus !== "ready")) {
    return (
      <div className="min-h-screen bg-ink-50 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <PageSkeleton />
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
