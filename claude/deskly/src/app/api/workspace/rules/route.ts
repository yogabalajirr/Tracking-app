import { z } from "zod";
import { badRequest, json, parseBody, withAuth } from "@/lib/api";
import { MAX_ACTIVE_RULES } from "@/lib/constants";
import { describeRule, ruleSchema } from "@/lib/rules";
import { validateRuleTargets } from "@/lib/rule-validation";

export const GET = withAuth("workspace.read", async (_req, { db }) => {
  const rules = await db.assignmentRule.findMany({ orderBy: { priority: "asc" } });

  return json({
    rules: rules.map((r) => ({ ...r, summary: describeRule(r.conditions, r.actions) })),
    maxActive: MAX_ACTIVE_RULES,
  });
});

export const POST = withAuth("workspace.manage", async (req, { db, workspaceId }) => {
  const input = await parseBody(req, ruleSchema);

  if (input.isActive) {
    const active = await db.assignmentRule.count({ where: { isActive: true } });
    if (active >= MAX_ACTIVE_RULES) {
      throw badRequest(
        `You already have ${MAX_ACTIVE_RULES} active rules. Deactivate one before adding another.`,
      );
    }
  }

  await validateRuleTargets(db, input.actions);

  const rule = await db.assignmentRule.create({
    data: {
      workspaceId,
      name: input.name,
      conditions: input.conditions,
      actions: input.actions,
      priority: input.priority,
      isActive: input.isActive,
    },
  });

  return json(
    { rule: { ...rule, summary: describeRule(rule.conditions, rule.actions) } },
    { status: 201 },
  );
});

/** Reorders rules; evaluation runs in ascending `priority`. */
const reorderSchema = z.object({ order: z.array(z.string().cuid()).min(1) });

export const PATCH = withAuth("workspace.manage", async (req, { db }) => {
  const { order } = await parseBody(req, reorderSchema);

  for (const [index, id] of order.entries()) {
    await db.assignmentRule.updateMany({ where: { id }, data: { priority: index } });
  }

  return json({ ok: true });
});
