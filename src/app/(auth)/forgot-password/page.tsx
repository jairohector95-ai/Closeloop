"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendPasswordReset, type AuthState } from "../actions";
import { AuthMessage, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(sendPasswordReset, {});
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send a link to choose a new one."
      footer={
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form action={action} className="space-y-5" noValidate>
        <AuthMessage error={state.error} message={state.message} />
        {!state.message ? (
          <>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={pending}>
                Send reset link
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </AuthShell>
  );
}
