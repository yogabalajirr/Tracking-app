"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/primitives";
import { signupAction, type FormState } from "../actions";
import { suggestSubdomain } from "@/lib/validation";
import { env as publicEnv } from "@/lib/public-env";

const initial: FormState = {};

/** Used when the browser will not tell us — and on the server, where nobody asked. */
const FALLBACK_TIMEZONE = "Asia/Kolkata";

/** The browser's zone never changes mid-session, so there is nothing to watch. */
const subscribeNothing = () => () => {};

function readBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initial);
  const [workspaceName, setWorkspaceName] = useState("");
  const [subdomainEdit, setSubdomainEdit] = useState<string | null>(null);

  // The subdomain mirrors the workspace name until the user types their own —
  // derived rather than mirrored into state, so the two can never drift.
  const subdomain = subdomainEdit ?? suggestSubdomain(workspaceName);

  // The browser's timezone is external state, so it is read through a store
  // with a server snapshot: the SSR pass and hydration agree on the fallback,
  // then the real zone takes over. It is changeable later in settings.
  const timezone = useSyncExternalStore(
    subscribeNothing,
    readBrowserTimezone,
    () => FALLBACK_TIMEZONE,
  );

  const fieldError = (name: string) => state.fieldErrors?.[name] ?? null;

  return (
    <Card>
      <CardContent className="pt-5">
        <form action={action} className="space-y-4" noValidate>
          {state.error && !state.fieldErrors && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <Field label="Your name" htmlFor="name" required error={fieldError("name")}>
            <Input name="name" autoComplete="name" placeholder="Priya Sharma" required />
          </Field>

          <Field label="Work email" htmlFor="email" required error={fieldError("email")}>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="priya@acme.com"
              required
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            required
            hint="At least 8 characters."
            error={fieldError("password")}
          >
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          <Field
            label="Workspace name"
            htmlFor="workspaceName"
            required
            error={fieldError("workspaceName")}
          >
            <Input
              name="workspaceName"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Acme Support"
              required
            />
          </Field>

          <Field
            label="Subdomain"
            htmlFor="subdomain"
            required
            hint={`Your support address will be support@${subdomain || "your-team"}.${publicEnv.emailDomain}`}
            error={fieldError("subdomain")}
          >
            <Input
              name="subdomain"
              value={subdomain}
              onChange={(e) => {
                setSubdomainEdit(e.target.value);
              }}
              placeholder="acme"
              required
            />
          </Field>

          <input type="hidden" name="timezone" value={timezone} />

          <Button type="submit" className="w-full" loading={pending}>
            {pending ? "Creating workspace…" : "Create workspace"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Times are shown in <span className="font-medium">{timezone}</span>. You can change
            this later in settings.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
