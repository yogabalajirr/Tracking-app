"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { env } from "@/lib/public-env";

/** The copy-paste embed code for the contact widget. */
export function WidgetSnippet({
  subdomain,
  brandColor,
}: {
  subdomain: string;
  brandColor: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const snippet = `<script src="${env.appUrl}/widget.js"
  data-workspace="${subdomain}"
  data-color="${brandColor}"
  data-label="Support"
  data-title="How can we help?"
  data-categories="Billing,Technical,Other"></script>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Website contact form</CardTitle>
        <CardDescription>
          Paste this before <code>&lt;/body&gt;</code> on your site. It adds a support button
          that opens a contact form; submissions arrive here as tickets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs scroll-slim">
          <code>{snippet}</code>
        </pre>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy embed code"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Convenience wrapper so the settings page can drop it in inline. */
export function publicEnvSnippet(subdomain: string, brandColor: string) {
  return <WidgetSnippet subdomain={subdomain} brandColor={brandColor} />;
}
