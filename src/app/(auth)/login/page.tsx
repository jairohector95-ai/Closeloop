"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { signIn, type AuthState } from "../actions";
import { AuthMessage, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function LoginPage() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});
  const linkError = params.get("error") === "link" ? "That link has expired or was already used. Sign in or request a new one." : undefined;

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to see what CloseLoop has been doing for you."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-brand-700 hover:underline">
            Start free
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="next" value={params.get("next") ?? ""} />
        <AuthMessage error={state.error ?? linkError} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus placeholder="you@yourbusiness.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex items-center justify-between">
          <Link href="/forgot-password" className="text-sm text-ink-500 hover:text-ink-900">
            Forgot password?
          </Link>
          <Button type="submit" loading={pending} icon={<ArrowRight className="h-4 w-4" />}>
            Sign in
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
