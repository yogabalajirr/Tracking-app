import "server-only";
import { prisma } from "./db";
import { DEFAULT_SLA, PRIORITIES } from "./constants";
import { hashPassword } from "./auth";
import { DEFAULT_BUSINESS_HOURS } from "./business-hours";
import type { Role } from "@/generated/prisma/enums";

export { DEFAULT_BUSINESS_HOURS };
export type { BusinessHours } from "./business-hours";

const STARTER_TAGS = [
  { name: "billing", color: "#f97316" },
  { name: "bug", color: "#ef4444" },
  { name: "how-to", color: "#3b82f6" },
  { name: "feature-request", color: "#8b5cf6" },
];

const STARTER_CANNED = [
  {
    shortcode: "thanks",
    title: "Thanks for reaching out",
    body:
      "Hi {{customer_name}},\n\nThanks for getting in touch with {{company_name}}. " +
      "I'm looking into this now and will come back to you shortly.\n\n" +
      "Best,\n{{agent_name}}",
  },
  {
    shortcode: "moreinfo",
    title: "Need more information",
    body:
      "Hi {{customer_name}},\n\nThanks for the report on ticket {{ticket_id}}. " +
      "To dig in further, could you share:\n\n" +
      "• What you were doing when it happened\n" +
      "• A screenshot, if you have one\n\n" +
      "Best,\n{{agent_name}}",
  },
  {
    shortcode: "resolved",
    title: "Resolved — closing the loop",
    body:
      "Hi {{customer_name}},\n\nThis should now be sorted. I'm marking ticket " +
      "{{ticket_id}} as resolved — just reply here if anything is still off and it " +
      "will reopen automatically.\n\nBest,\n{{agent_name}}",
  },
];

/**
 * Creates a workspace and its owner, plus the defaults that make the product
 * usable immediately: SLA policies for every priority, a few starter tags and
 * canned responses, and business hours.
 *
 * Runs in one transaction so a half-provisioned workspace can never exist.
 */
export async function provisionWorkspace(input: {
  workspaceName: string;
  subdomain: string;
  timezone: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}) {
  const passwordHash = await hashPassword(input.ownerPassword);

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.workspaceName,
        subdomain: input.subdomain,
        timezone: input.timezone,
        businessHours: DEFAULT_BUSINESS_HOURS as unknown as object,
      },
    });

    const owner = await tx.user.create({
      data: {
        workspaceId: workspace.id,
        email: input.ownerEmail,
        name: input.ownerName,
        passwordHash,
        role: "OWNER" satisfies Role,
      },
    });

    await tx.slaPolicy.createMany({
      data: PRIORITIES.map((priority) => ({
        workspaceId: workspace.id,
        priority,
        firstResponseMinutes: DEFAULT_SLA[priority].firstResponseMinutes,
        resolutionMinutes: DEFAULT_SLA[priority].resolutionMinutes,
      })),
    });

    await tx.tag.createMany({
      data: STARTER_TAGS.map((t) => ({ ...t, workspaceId: workspace.id })),
    });

    await tx.cannedResponse.createMany({
      data: STARTER_CANNED.map((c) => ({ ...c, workspaceId: workspace.id, userId: null })),
    });

    return { workspace, owner };
  });
}

/**
 * Allocates the next human-readable ticket number for a workspace.
 * Must be called inside a transaction; the atomic increment is what prevents
 * two concurrent tickets from claiming the same number.
 */
export async function nextTicketNumber(
  tx: Pick<typeof prisma, "workspace">,
  workspaceId: string,
): Promise<number> {
  const updated = await tx.workspace.update({
    where: { id: workspaceId },
    data: { ticketCounter: { increment: 1 } },
    select: { ticketCounter: true },
  });
  return updated.ticketCounter;
}
