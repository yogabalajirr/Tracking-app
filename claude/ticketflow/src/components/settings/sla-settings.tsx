"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { PRIORITY_LABELS, PRIORITY_STYLES } from "@/lib/constants";
import { can } from "@/lib/rbac";
import type { Priority, Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type Policy = {
  priority: Priority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
};

/** Minutes ↔ a readable "4h 30m", so admins never count minutes in their head. */
function humanise(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function SlaSettings({ initial, role }: { initial: Policy[]; role: Role }) {
  const editable = can(role, "workspace.manage");
  const [policies, setPolicies] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function update(priority: Priority, patch: Partial<Policy>) {
    setPolicies((prev) =>
      prev.map((p) => (p.priority === priority ? { ...p, ...patch } : p)),
    );
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const p of policies) {
      if (p.firstResponseMinutes < 1) {
        next[p.priority] = "First response must be at least a minute.";
      } else if (p.resolutionMinutes < p.firstResponseMinutes) {
        next[p.priority] = "Resolution can't be shorter than first response.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/workspace/sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save the SLA policies.");
        return;
      }
      toast.success("SLA policies saved.");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">SLA policies</h1>
        <p className="text-sm text-muted-foreground">
          Response and resolution targets per priority. Tickets turn amber at 75% of a target
          and red once it&apos;s missed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Targets</CardTitle>
          <CardDescription>Entered in minutes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {policies.map((policy) => (
            <div key={policy.priority} className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-xs font-medium",
                    PRIORITY_STYLES[policy.priority],
                  )}
                >
                  {PRIORITY_LABELS[policy.priority]}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    First response
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={policy.firstResponseMinutes}
                      disabled={!editable}
                      aria-label={`${PRIORITY_LABELS[policy.priority]} first response target in minutes`}
                      onChange={(e) =>
                        update(policy.priority, {
                          firstResponseMinutes: Number(e.target.value),
                        })
                      }
                      className="h-8 w-28"
                    />
                    <span className="text-muted-foreground">
                      {humanise(policy.firstResponseMinutes)}
                    </span>
                  </div>
                </label>

                <label className="text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">
                    Resolution
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={policy.resolutionMinutes}
                      disabled={!editable}
                      aria-label={`${PRIORITY_LABELS[policy.priority]} resolution target in minutes`}
                      onChange={(e) =>
                        update(policy.priority, { resolutionMinutes: Number(e.target.value) })
                      }
                      className="h-8 w-28"
                    />
                    <span className="text-muted-foreground">
                      {humanise(policy.resolutionMinutes)}
                    </span>
                  </div>
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={policy.businessHoursOnly}
                  disabled={!editable}
                  onChange={(e) =>
                    update(policy.priority, { businessHoursOnly: e.target.checked })
                  }
                  className="size-3.5 rounded border-border"
                />
                Only count business hours
              </label>

              {errors[policy.priority] && (
                <p role="alert" className="text-xs text-destructive">
                  {errors[policy.priority]}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {editable && (
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>
            <Save /> Save policies
          </Button>
        </div>
      )}
    </div>
  );
}
