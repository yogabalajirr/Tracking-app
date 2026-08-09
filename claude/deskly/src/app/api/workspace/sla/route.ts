import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { PRIORITIES } from "@/lib/constants";

export const GET = withAuth("workspace.read", async (_req, { db }) => {
  const policies = await db.slaPolicy.findMany();

  // Return them in a stable, meaningful order rather than insertion order.
  policies.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));

  return json({ policies });
});

const putSchema = z.object({
  policies: z
    .array(
      z.object({
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
        firstResponseMinutes: z
          .number()
          .int()
          .min(1, "Give the first-response target at least a minute.")
          .max(60 * 24 * 30),
        resolutionMinutes: z.number().int().min(1).max(60 * 24 * 90),
        businessHoursOnly: z.boolean().default(true),
      }),
    )
    .min(1),
});

/** PUT /api/workspace/sla — replaces the policy set. */
export const PUT = withAuth("workspace.manage", async (req, { db, workspaceId }) => {
  const input = await parseBody(req, putSchema);

  for (const policy of input.policies) {
    if (policy.resolutionMinutes < policy.firstResponseMinutes) {
      return json(
        {
          error: `The ${policy.priority.toLowerCase()} resolution target must be at least as long as its first-response target.`,
        },
        { status: 422 },
      );
    }
  }

  const saved = [];
  for (const policy of input.policies) {
    saved.push(
      await db.slaPolicy.upsert({
        where: {
          workspaceId_priority: { workspaceId, priority: policy.priority },
        },
        create: { workspaceId, ...policy },
        update: {
          firstResponseMinutes: policy.firstResponseMinutes,
          resolutionMinutes: policy.resolutionMinutes,
          businessHoursOnly: policy.businessHoursOnly,
        },
      }),
    );
  }

  return json({ policies: saved });
});
