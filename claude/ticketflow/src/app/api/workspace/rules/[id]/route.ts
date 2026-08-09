import { badRequest, json, notFound, parseBody, withAuth } from "@/lib/api";
import { MAX_ACTIVE_RULES } from "@/lib/constants";
import { describeRule, ruleSchema } from "@/lib/rules";
import { validateRuleTargets } from "@/lib/rule-validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>("workspace.manage", async (req, { db }, { params }) => {
  const { id } = await params;
  const input = await parseBody(req, ruleSchema);

  const existing = await db.assignmentRule.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!existing) throw notFound("That rule no longer exists.");

  if (input.isActive && !existing.isActive) {
    const active = await db.assignmentRule.count({ where: { isActive: true } });
    if (active >= MAX_ACTIVE_RULES) {
      throw badRequest(
        `You already have ${MAX_ACTIVE_RULES} active rules. Deactivate one first.`,
      );
    }
  }

  await validateRuleTargets(db, input.actions);

  const rule = await db.assignmentRule.update({
    where: { id },
    data: {
      name: input.name,
      conditions: input.conditions,
      actions: input.actions,
      priority: input.priority,
      isActive: input.isActive,
    },
  });

  return json({ rule: { ...rule, summary: describeRule(rule.conditions, rule.actions) } });
});

export const DELETE = withAuth<Ctx>("workspace.manage", async (_req, { db }, { params }) => {
  const { id } = await params;
  await db.assignmentRule.delete({ where: { id } });
  return json({ ok: true });
});
