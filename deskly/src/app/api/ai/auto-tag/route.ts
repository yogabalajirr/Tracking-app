import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { aiGuard } from "@/lib/ai-route";
import { triageTicket } from "@/lib/ai-triage";

/**
 * Re-runs triage on an existing ticket.
 *
 * New tickets are triaged automatically in the background on creation; this is
 * the manual "have another look" for a thread that has changed shape since —
 * or for the tickets that arrived while the API key was missing.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  ticketId: z.string().min(1),
  /** Let triage raise the priority. Off by default when a human asked for it. */
  applyPriority: z.boolean().default(false),
});

export const POST = withAuth("tickets.write", async (req, { user, workspaceId }) => {
  aiGuard(user.id, "auto-tag");

  const { ticketId, applyPriority } = await parseBody(req, bodySchema);

  const result = await triageTicket(workspaceId, ticketId, {
    allowPriorityChange: applyPriority,
  });

  if (!result.classification) {
    return json({ applied: false, reason: "The model had no confident answer." });
  }

  return json({
    applied: result.applied,
    category: result.classification.category,
    suggestedPriority: result.classification.priority,
    priorityApplied: result.priorityChanged,
    reason: result.classification.reason,
  });
});
