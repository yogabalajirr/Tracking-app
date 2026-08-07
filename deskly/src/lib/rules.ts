import { z } from "zod";

/**
 * Assignment rules: `IF <conditions> THEN <actions>`.
 *
 * Rules are stored as JSON so admins can build them in the UI without a schema
 * migration, but everything is validated through these schemas on the way in
 * and on the way out — a malformed rule is skipped, never crashes routing.
 */

export const RULE_FIELDS = {
  sender_email: "Sender email",
  sender_domain: "Sender domain",
  subject: "Subject",
  body: "Message body",
  channel: "Channel",
  priority: "Priority",
} as const;

export const RULE_OPERATORS = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
} as const;

export const RULE_ACTIONS = {
  assign_user: "Assign to agent",
  assign_team: "Assign to team",
  set_priority: "Set priority",
  add_tag: "Add tag",
  set_status: "Set status",
} as const;

export type RuleField = keyof typeof RULE_FIELDS;
export type RuleOperator = keyof typeof RULE_OPERATORS;
export type RuleActionType = keyof typeof RULE_ACTIONS;

export const conditionSchema = z.object({
  field: z.enum(Object.keys(RULE_FIELDS) as [RuleField, ...RuleField[]]),
  op: z.enum(Object.keys(RULE_OPERATORS) as [RuleOperator, ...RuleOperator[]]),
  value: z.string().min(1, "Give the condition a value."),
});

export const actionSchema = z.object({
  action: z.enum(Object.keys(RULE_ACTIONS) as [RuleActionType, ...RuleActionType[]]),
  value: z.string().min(1, "Give the action a value."),
});

export const ruleSchema = z.object({
  name: z.string().trim().min(1, "Name your rule.").max(120),
  conditions: z.array(conditionSchema).min(1, "Add at least one condition."),
  actions: z.array(actionSchema).min(1, "Add at least one action."),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type RuleCondition = z.infer<typeof conditionSchema>;
export type RuleAction = z.infer<typeof actionSchema>;

/** The ticket facts a rule can match on. */
export type RuleContext = {
  senderEmail: string;
  subject: string;
  body: string;
  channel: string;
  priority: string;
};

export function senderDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function fieldValue(field: RuleField, ctx: RuleContext): string {
  switch (field) {
    case "sender_email":
      return ctx.senderEmail.toLowerCase();
    case "sender_domain":
      return senderDomain(ctx.senderEmail);
    case "subject":
      return ctx.subject.toLowerCase();
    case "body":
      return ctx.body.toLowerCase();
    case "channel":
      return ctx.channel.toLowerCase();
    case "priority":
      return ctx.priority.toLowerCase();
  }
}

export function evaluateCondition(condition: RuleCondition, ctx: RuleContext): boolean {
  const actual = fieldValue(condition.field, ctx);
  const expected = condition.value.trim().toLowerCase();

  switch (condition.op) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "not_contains":
      return !actual.includes(expected);
    case "starts_with":
      return actual.startsWith(expected);
    case "ends_with":
      return actual.endsWith(expected);
  }
}

/** All conditions must hold (AND). */
export function matchesRule(conditions: unknown, ctx: RuleContext): boolean {
  const parsed = z.array(conditionSchema).safeParse(conditions);
  if (!parsed.success || parsed.data.length === 0) return false;
  return parsed.data.every((c) => evaluateCondition(c, ctx));
}

export function parseActions(actions: unknown): RuleAction[] {
  const parsed = z.array(actionSchema).safeParse(actions);
  return parsed.success ? parsed.data : [];
}

export type RuleOutcome = {
  assigneeId?: string;
  teamId?: string;
  priority?: string;
  status?: string;
  tags: string[];
  /** Names of the rules that fired, for the activity log. */
  matchedRules: string[];
};

/**
 * Evaluates rules top-down (ascending `priority`). Later rules override earlier
 * ones for scalar fields; tags accumulate. Every matching rule is applied —
 * evaluation does not stop at the first hit — which is what makes
 * "tag everything from acme.com" and "route billing to the billing team"
 * composable.
 */
export function evaluateRules(
  rules: { name: string; conditions: unknown; actions: unknown; isActive: boolean }[],
  ctx: RuleContext,
): RuleOutcome {
  const outcome: RuleOutcome = { tags: [], matchedRules: [] };

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (!matchesRule(rule.conditions, ctx)) continue;

    outcome.matchedRules.push(rule.name);

    for (const action of parseActions(rule.actions)) {
      switch (action.action) {
        case "assign_user":
          outcome.assigneeId = action.value;
          break;
        case "assign_team":
          outcome.teamId = action.value;
          break;
        case "set_priority":
          outcome.priority = action.value.toUpperCase();
          break;
        case "set_status":
          outcome.status = action.value.toUpperCase();
          break;
        case "add_tag":
          if (!outcome.tags.includes(action.value)) outcome.tags.push(action.value);
          break;
      }
    }
  }

  return outcome;
}

/** Human-readable summary shown in the rules list. */
export function describeRule(conditions: unknown, actions: unknown): string {
  const conds = z.array(conditionSchema).safeParse(conditions);
  const acts = z.array(actionSchema).safeParse(actions);
  if (!conds.success || !acts.success) return "Invalid rule";

  const ifPart = conds.data
    .map((c) => `${RULE_FIELDS[c.field]} ${RULE_OPERATORS[c.op]} "${c.value}"`)
    .join(" AND ");
  const thenPart = acts.data
    .map((a) => `${RULE_ACTIONS[a.action]} → ${a.value}`)
    .join(", ");

  return `IF ${ifPart} THEN ${thenPart}`;
}
