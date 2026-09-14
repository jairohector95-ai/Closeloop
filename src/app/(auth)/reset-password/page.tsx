"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "../actions";
import { AuthMessage, AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <AuthShell title="Choose a new password" description="You're signed in through your reset link. Pick a new password to finish.">
      <form action={action} className="space-y-5" noValidate>
        <AuthMessage error={state.error} />
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Save password
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
