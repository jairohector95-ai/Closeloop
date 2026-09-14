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
  const hydrated = useAppStore((s) => s.hydrated);
  const hasAccount = useAppStore((s) => s.account !== null);

  useEffect(() => {
    if (hydrated && !hasAccount) router.replace("/onboarding");
  }, [hydrated, hasAccount, router]);

  if (!hydrated || !hasAccount) {
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
