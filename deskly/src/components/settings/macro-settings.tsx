"use client";

import * as React from "react";
import { Globe, Plus, Trash2, User, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { MACRO_VARIABLES, usedVariables } from "@/lib/macros";
import { can } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

type Macro = {
  id: string;
  shortcode: string;
  title: string;
  body: string;
  userId: string | null;
};

export function MacroSettings({
  role,
  currentUserId,
  initial,
}: {
  role: Role;
  currentUserId: string;
  initial: Macro[];
}) {
  const [macros, setMacros] = React.useState(initial);
  const [editing, setEditing] = React.useState<Macro | null>(null);
  const [creating, setCreating] = React.useState(false);

  const canShare = can(role, "workspace.manage");

  async function save(macro: Macro, shared: boolean, isNew: boolean) {
    const res = await fetch(
      isNew ? "/api/canned-responses" : `/api/canned-responses/${macro.id}`,
      {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortcode: macro.shortcode,
          title: macro.title,
          body: macro.body,
          ...(isNew ? { shared } : {}),
        }),
      },
    );
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error ?? "Couldn't save that canned response.");
      if (Array.isArray(data.details)) {
        for (const d of data.details) toast.error(d.message);
      }
      return false;
    }

    setMacros((prev) =>
      isNew
        ? [...prev, data.response]
        : prev.map((m) => (m.id === macro.id ? data.response : m)),
    );
    toast.success(isNew ? "Canned response created." : "Canned response saved.");
    return true;
  }

  async function remove(id: string) {
    const res = await fetch(`/api/canned-responses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Couldn't delete that.");
      return;
    }
    setMacros((prev) => prev.filter((m) => m.id !== id));
    toast.success("Canned response deleted.");
  }

  const shared = macros.filter((m) => m.userId === null);
  const personal = macros.filter((m) => m.userId !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Canned responses</h1>
        <p className="text-sm text-muted-foreground">
          Type <code className="rounded bg-muted px-1">/shortcode</code> in the reply box to
          insert one. Variables are filled in as you insert.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Your library</CardTitle>
            <CardDescription>
              {shared.length} workspace-wide · {personal.length} personal
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New response
          </Button>
        </CardHeader>

        <CardContent>
          {macros.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No canned responses yet"
              description="Save the replies you send over and over."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus /> New response
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {macros.map((macro) => {
                const editable = macro.userId === currentUserId || canShare;

                return (
                  <li
                    key={macro.id}
                    className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          /{macro.shortcode}
                        </code>
                        <span className="text-sm font-medium">{macro.title}</span>
                        <Badge variant={macro.userId ? "muted" : "default"}>
                          {macro.userId ? (
                            <>
                              <User className="size-3" /> Personal
                            </>
                          ) : (
                            <>
                              <Globe className="size-3" /> Workspace
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                        {macro.body}
                      </p>
                    </div>

                    {editable && (
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(macro)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${macro.title}`}
                          onClick={() => void remove(macro.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <MacroEditor
          macro={editing ?? { id: "", shortcode: "", title: "", body: "", userId: currentUserId }}
          isNew={creating}
          canShare={canShare}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (macro, isShared) => {
            const ok = await save(macro, isShared, creating);
            if (ok) {
              setCreating(false);
              setEditing(null);
            }
          }}
        />
      )}
    </div>
  );
}

function MacroEditor({
  macro: initial,
  isNew,
  canShare,
  onClose,
  onSave,
}: {
  macro: Macro;
  isNew: boolean;
  canShare: boolean;
  onClose: () => void;
  onSave: (macro: Macro, shared: boolean) => void | Promise<void>;
}) {
  const [macro, setMacro] = React.useState(initial);
  const [shared, setShared] = React.useState(initial.userId === null);
  const [saving, setSaving] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  function insertVariable(key: string) {
    const el = bodyRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const token = `{{${key}}}`;
    const next = macro.body.slice(0, start) + token + macro.body.slice(end);

    setMacro((m) => ({ ...m, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const used = usedVariables(macro.body);
  const valid = macro.shortcode.trim() && macro.title.trim() && macro.body.trim();

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={isNew ? "New canned response" : "Edit canned response"}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Shortcode" htmlFor="macro-shortcode" required hint="Typed after a slash.">
            <Input
              id="macro-shortcode"
              value={macro.shortcode}
              onChange={(e) =>
                setMacro((m) => ({ ...m, shortcode: e.target.value.toLowerCase() }))
              }
              placeholder="thanks"
              autoFocus
            />
          </Field>

          <Field label="Title" htmlFor="macro-title" required>
            <Input
              id="macro-title"
              value={macro.title}
              onChange={(e) => setMacro((m) => ({ ...m, title: e.target.value }))}
              placeholder="Thanks for reaching out"
            />
          </Field>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="macro-body" className="block text-sm font-medium">
            Response text
          </label>
          <Textarea
            id="macro-body"
            ref={bodyRef}
            value={macro.body}
            onChange={(e) => setMacro((m) => ({ ...m, body: e.target.value }))}
            rows={8}
            placeholder="Hi {{customer_name}},&#10;&#10;Thanks for getting in touch…"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Insert:</span>
            {MACRO_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                title={v.label}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>

          {used.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Uses: {used.map((u) => `{{${u}}}`).join(", ")}
            </p>
          )}
        </div>

        {isNew && canShare && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="size-3.5 rounded border-border"
            />
            Share with the whole workspace
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!valid}
            onClick={async () => {
              setSaving(true);
              await onSave(macro, shared);
              setSaving(false);
            }}
          >
            {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
