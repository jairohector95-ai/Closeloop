import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

export function AuthShell({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="px-6 py-5 sm:px-10">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:px-6 sm:pt-10">
        <div className="w-full max-w-md">
          <section className="rise rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">
            <h1 className="font-display text-2xl font-semibold text-ink-900 sm:text-[1.75rem]">{title}</h1>
            {description ? <p className="mt-2 text-[15px] text-ink-500">{description}</p> : null}
            <div className="mt-6">{children}</div>
          </section>
          {footer ? <p className="mt-5 text-center text-sm text-ink-500">{footer}</p> : null}
          <p className="mt-3 text-center text-xs text-ink-400">
            <Link href="/" className="hover:text-ink-600">
              ← Back to closeloop
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export function AuthMessage({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
        {error}
      </p>
    );
  }
  if (message) {
    return <p className="rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700">{message}</p>;
  }
  return null;
}
