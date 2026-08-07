"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Mail, Rocket, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";

/**
 * Shown once after signup. The 15-minute setup target is only credible if the
 * first screen tells you exactly what the next three steps are.
 */
export function WelcomeBanner({
  workspaceName,
  supportEmail,
}: {
  workspaceName: string;
  supportEmail: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(supportEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Rocket className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Welcome to {workspaceName}</h1>
          <p className="text-sm text-muted-foreground">
            Three short steps and you&apos;re handling real tickets.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" /> 1. Forward your support email here
          </CardTitle>
          <CardDescription>
            Point your existing support address at this inbox, and every email becomes a
            ticket automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {supportEmail}
            </code>
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" /> 2. Invite your teammates
          </CardTitle>
          <CardDescription>
            They get a magic link and can start working the queue straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/settings/members">Invite teammates</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="size-4" /> 3. Check your SLAs and business hours
          </CardTitle>
          <CardDescription>
            Sensible defaults are already in place — adjust them if your targets differ.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/sla">SLA policies</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings">Business hours</Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Or just{" "}
        <Link href="/inbox" className="font-medium text-primary hover:underline">
          go to the inbox
        </Link>
        .
      </p>
    </div>
  );
}
