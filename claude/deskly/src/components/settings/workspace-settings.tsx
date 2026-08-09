"use client";

import * as React from "react";
import { Check, Copy, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import type { BusinessHours } from "@/lib/business-hours";
import { can } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";
import { publicEnvSnippet } from "./widget-snippet";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A short, sensible timezone list plus whatever the workspace already uses. */
const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

export function WorkspaceSettings({
  workspace,
  role,
}: {
  workspace: {
    name: string;
    subdomain: string;
    brandColor: string | null;
    logoUrl: string | null;
    timezone: string;
    businessHours: BusinessHours;
    supportEmail: string;
  };
  role: Role;
}) {
  const editable = can(role, "workspace.manage");

  const [name, setName] = React.useState(workspace.name);
  const [brandColor, setBrandColor] = React.useState(workspace.brandColor ?? "#1e1e1e");
  const [logoUrl, setLogoUrl] = React.useState(workspace.logoUrl ?? "");
  const [timezone, setTimezone] = React.useState(workspace.timezone);
  const [hours, setHours] = React.useState<BusinessHours>(workspace.businessHours);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const timezones = React.useMemo(
    () => [...new Set([workspace.timezone, ...COMMON_TIMEZONES])].sort(),
    [workspace.timezone],
  );

  function setDay(day: number, ranges: { start: string; end: string }[]) {
    setHours((prev) => ({ ...prev, days: { ...prev.days, [String(day)]: ranges } }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          brandColor,
          logoUrl: logoUrl.trim() || null,
          timezone,
          businessHours: hours,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save those settings.");
        return;
      }
      toast.success("Workspace settings saved.");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copySupport() {
    await navigator.clipboard.writeText(workspace.supportEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Branding, timezone and when your team is open for business.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Support address</CardTitle>
          <CardDescription>
            Forward your existing support inbox here and every email becomes a ticket.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {workspace.supportEmail}
          </code>
          <Button variant="outline" size="sm" onClick={copySupport}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Workspace name" htmlFor="ws-name">
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editable}
            />
          </Field>

          <Field
            label="Subdomain"
            htmlFor="ws-subdomain"
            hint="Fixed after signup — it forms your support address and portal URLs."
          >
            <Input id="ws-subdomain" value={workspace.subdomain} disabled readOnly />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand colour" htmlFor="ws-color">
              <div className="flex gap-2">
                <input
                  id="ws-color"
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  disabled={!editable}
                  aria-label="Brand colour"
                  className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background disabled:opacity-60"
                />
                <Input
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  disabled={!editable}
                  aria-label="Brand colour hex value"
                  className="font-mono"
                />
              </div>
            </Field>

            <Field label="Logo URL" htmlFor="ws-logo" hint="Optional.">
              <Input
                id="ws-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={!editable}
                placeholder="https://…"
              />
            </Field>
          </div>

          <Field
            label="Timezone"
            htmlFor="ws-tz"
            hint="All timestamps are stored in UTC and shown in this timezone."
          >
            <select
              id="ws-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!editable}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business hours</CardTitle>
          <CardDescription>
            SLA timers only run while you&apos;re open, so a ticket raised on Friday evening
            isn&apos;t overdue by Monday morning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {DAY_NAMES.map((label, day) => {
            const ranges = hours.days[String(day)] ?? [];
            const open = ranges.length > 0;

            return (
              <div key={day} className="flex flex-wrap items-center gap-3">
                <label className="flex w-32 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={open}
                    disabled={!editable}
                    onChange={(e) =>
                      setDay(day, e.target.checked ? [{ start: "09:00", end: "18:00" }] : [])
                    }
                    className="size-3.5 rounded border-border"
                  />
                  {label}
                </label>

                {open ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={ranges[0].start}
                      disabled={!editable}
                      aria-label={`${label} opening time`}
                      onChange={(e) => setDay(day, [{ ...ranges[0], start: e.target.value }])}
                      className="h-8 w-28"
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={ranges[0].end}
                      disabled={!editable}
                      aria-label={`${label} closing time`}
                      onChange={(e) => setDay(day, [{ ...ranges[0], end: e.target.value }])}
                      className="h-8 w-28"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}

          <p className="pt-2 text-xs text-muted-foreground">
            Leave every day closed to run SLA timers around the clock.
          </p>
        </CardContent>
      </Card>

      {publicEnvSnippet(workspace.subdomain, brandColor)}

      {editable && (
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>
            <Save /> Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
