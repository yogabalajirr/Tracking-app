"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  RULE_ACTIONS,
  RULE_FIELDS,
  RULE_OPERATORS,
  type RuleAction,
  type RuleActionType,
  type RuleCondition,
  type RuleField,
  type RuleOperator,
} from "@/lib/rules";
import { MAX_ACTIVE_RULES, PRIORITIES, PRIORITY_LABELS } from "@/lib/constants";
import { can } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

type Rule = {
  id: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  isActive: boolean;
  summary: string;
};

const BLANK_CONDITION: RuleCondition = { field: "sender_domain", op: "equals", value: "" };
const BLANK_ACTION: RuleAction = { action: "assign_team", value: "" };

export function RulesSettings({
  role,
  initialRules,
  agents,
  teams,
  tags,
}: {
  role: Role;
  initialRules: Rule[];
  agents: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  tags: string[];
}) {
  const editable = can(role, "workspace.manage");
  const [rules, setRules] = React.useState(initialRules);
  const [editing, setEditing] = React.useState<Rule | null>(null);
  const [creating, setCreating] = React.useState(false);

  const activeCount = rules.filter((r) => r.isActive).length;

  async function persist(rule: Rule, isNew: boolean) {
    const url = isNew ? "/api/workspace/rules" : `/api/workspace/rules/${rule.id}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: rule.name,
        conditions: rule.conditions,
        actions: rule.actions,
        priority: rule.priority,
        isActive: rule.isActive,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error ?? "Couldn't save that rule.");
      if (Array.isArray(data.details)) {
        for (const d of data.details) toast.error(`${d.field}: ${d.message}`);
      }
      return false;
    }

    setRules((prev) =>
      isNew ? [...prev, data.rule] : prev.map((r) => (r.id === rule.id ? data.rule : r)),
    );
    toast.success(isNew ? "Rule created." : "Rule saved.");
    return true;
  }

  async function remove(id: string) {
    const res = await fetch(`/api/workspace/rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't delete that rule.");
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success("Rule deleted.");
  }

  async function move(index: number, delta: number) {
    const next = [...rules];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [next[target], next[index]];
    setRules(next.map((r, i) => ({ ...r, priority: i })));

    await fetch("/api/workspace/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((r) => r.id) }),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Routing rules</h1>
        <p className="text-sm text-muted-foreground">
          Rules run top to bottom on every new ticket. Every match applies, so later rules can
          refine earlier ones.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Rules</CardTitle>
            <CardDescription>
              {activeCount} of {MAX_ACTIVE_RULES} active
            </CardDescription>
          </div>
          {editable && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New rule
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {rules.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title="No routing rules yet"
              description="Add one to send billing questions to the billing team, or flag your biggest customer as urgent."
              action={
                editable ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus /> New rule
                  </Button>
                ) : null
              }
            />
          ) : (
            <ol className="space-y-2">
              {rules.map((rule, index) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3"
                >
                  <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{rule.name}</span>
                      {!rule.isActive && <Badge variant="muted">Paused</Badge>}
                    </div>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {rule.summary}
                    </p>
                  </div>

                  {editable && (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move down"
                        disabled={index === rules.length - 1}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete rule ${rule.name}`}
                        onClick={() => void remove(rule.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <RuleEditor
          rule={
            editing ?? {
              id: "",
              name: "",
              conditions: [{ ...BLANK_CONDITION }],
              actions: [{ ...BLANK_ACTION }],
              priority: rules.length,
              isActive: true,
              summary: "",
            }
          }
          isNew={creating}
          agents={agents}
          teams={teams}
          tags={tags}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (rule) => {
            const ok = await persist(rule, creating);
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

function RuleEditor({
  rule: initial,
  isNew,
  agents,
  teams,
  tags,
  onClose,
  onSave,
}: {
  rule: Rule;
  isNew: boolean;
  agents: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  tags: string[];
  onClose: () => void;
  onSave: (rule: Rule) => void | Promise<void>;
}) {
  const [rule, setRule] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  function setCondition(index: number, patch: Partial<RuleCondition>) {
    setRule((r) => ({
      ...r,
      conditions: r.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function setAction(index: number, patch: Partial<RuleAction>) {
    setRule((r) => ({
      ...r,
      actions: r.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  }

  /** The value input depends on which action was picked. */
  function actionValueInput(action: RuleAction, index: number) {
    const common = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

    if (action.action === "assign_user") {
      return (
        <select
          value={action.value}
          aria-label="Agent"
          onChange={(e) => setAction(index, { value: e.target.value })}
          className={common}
        >
          <option value="">Choose an agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      );
    }

    if (action.action === "assign_team") {
      return (
        <select
          value={action.value}
          aria-label="Team"
          onChange={(e) => setAction(index, { value: e.target.value })}
          className={common}
        >
          <option value="">Choose a team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      );
    }

    if (action.action === "set_priority") {
      return (
        <select
          value={action.value}
          aria-label="Priority"
          onChange={(e) => setAction(index, { value: e.target.value })}
          className={common}
        >
          <option value="">Choose a priority…</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      );
    }

    if (action.action === "set_status") {
      return (
        <select
          value={action.value}
          aria-label="Status"
          onChange={(e) => setAction(index, { value: e.target.value })}
          className={common}
        >
          <option value="">Choose a status…</option>
          <option value="OPEN">Open</option>
          <option value="PENDING">Pending</option>
          <option value="ON_HOLD">On hold</option>
        </select>
      );
    }

    return (
      <>
        <Input
          list="rule-tag-options"
          value={action.value}
          aria-label="Tag"
          placeholder="Tag name"
          onChange={(e) => setAction(index, { value: e.target.value })}
          className="h-8"
        />
        <datalist id="rule-tag-options">
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </>
    );
  }

  const valid =
    rule.name.trim().length > 0 &&
    rule.conditions.every((c) => c.value.trim().length > 0) &&
    rule.actions.every((a) => a.value.trim().length > 0);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={isNew ? "New routing rule" : "Edit rule"}
      description="If every condition matches, all of the actions are applied."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Rule name</span>
          <Input
            value={rule.name}
            onChange={(e) => setRule((r) => ({ ...r, name: e.target.value }))}
            placeholder="Enterprise customers → Tier 2"
            autoFocus
          />
        </label>

        <section>
          <p className="mb-2 text-sm font-medium">If…</p>
          <div className="space-y-2">
            {rule.conditions.map((condition, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select
                  value={condition.field}
                  aria-label="Field"
                  onChange={(e) =>
                    setCondition(index, { field: e.target.value as RuleField })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {Object.entries(RULE_FIELDS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <select
                  value={condition.op}
                  aria-label="Operator"
                  onChange={(e) => setCondition(index, { op: e.target.value as RuleOperator })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {Object.entries(RULE_OPERATORS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <Input
                  value={condition.value}
                  aria-label="Value"
                  placeholder="acme.com"
                  onChange={(e) => setCondition(index, { value: e.target.value })}
                  className="h-8 flex-1"
                />

                {rule.conditions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove condition"
                    onClick={() =>
                      setRule((r) => ({
                        ...r,
                        conditions: r.conditions.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() =>
              setRule((r) => ({ ...r, conditions: [...r.conditions, { ...BLANK_CONDITION }] }))
            }
          >
            <Plus /> Add condition
          </Button>
        </section>

        <section>
          <p className="mb-2 text-sm font-medium">Then…</p>
          <div className="space-y-2">
            {rule.actions.map((action, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select
                  value={action.action}
                  aria-label="Action"
                  onChange={(e) =>
                    setAction(index, {
                      action: e.target.value as RuleActionType,
                      value: "",
                    })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {Object.entries(RULE_ACTIONS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <div className="flex-1">{actionValueInput(action, index)}</div>

                {rule.actions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove action"
                    onClick={() =>
                      setRule((r) => ({
                        ...r,
                        actions: r.actions.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() =>
              setRule((r) => ({ ...r, actions: [...r.actions, { ...BLANK_ACTION }] }))
            }
          >
            <Plus /> Add action
          </Button>
        </section>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.isActive}
            onChange={(e) => setRule((r) => ({ ...r, isActive: e.target.checked }))}
            className="size-3.5 rounded border-border"
          />
          Active
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!valid}
            onClick={async () => {
              setSaving(true);
              await onSave(rule);
              setSaving(false);
            }}
          >
            {isNew ? "Create rule" : "Save rule"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
