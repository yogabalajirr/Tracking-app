"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { acceptInviteAction, type FormState } from "../../actions";

const initial: FormState = {};

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, initial);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <Field label="Email" htmlFor="invite-email" hint="Fixed by the invite.">
        <Input id="invite-email" value={email} disabled readOnly />
      </Field>

      <Field label="Your name" htmlFor="name" required error={state.fieldErrors?.name}>
        <Input name="name" autoComplete="name" required autoFocus />
      </Field>

      <Field
        label="Choose a password"
        htmlFor="password"
        required
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? "Setting up…" : "Join the workspace"}
      </Button>
    </form>
  );
}
