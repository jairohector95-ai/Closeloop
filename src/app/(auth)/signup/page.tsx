"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { signUp, type AuthState } from "../actions";
import { AuthMessage, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, {});

  return (
    <AuthShell
      title="Start free"
      description="Create your account. Your business details come next and take about a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-5" noValidate>
        <AuthMessage error={state.error} message={state.message} />
        {!state.message ? (
          <>
            <Field label="Email" htmlFor="email" hint="Use the address customers already know you by.">
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus placeholder="you@yourbusiness.com" />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least 8 characters.">
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={pending} icon={<ArrowRight className="h-4 w-4" />}>
                Create account
              </Button>
            </div>
            <p className="text-xs text-ink-400">No credit card. Free while CloseLoop is in early access.</p>
          </>
        ) : null}
      </form>
    </AuthShell>
  );
}
