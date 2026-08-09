"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/primitives";
import { loginAction, type FormState } from "../actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <Card>
      <CardContent className="pt-5">
        <form action={action} className="space-y-4" noValidate>
          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <Field
            label="Email"
            htmlFor="email"
            required
            error={state.fieldErrors?.email ?? null}
          >
            <Input name="email" type="email" autoComplete="email" required autoFocus />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            required
            error={state.fieldErrors?.password ?? null}
          >
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>

          <Button type="submit" className="w-full" loading={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
