import { z } from "zod";
import { json, notFound, parseBody, withAuth } from "@/lib/api";
import { addMessage } from "@/lib/tickets";
import { sendTicketReply } from "@/lib/email/send";

type Ctx = { params: Promise<{ id: string }> };

const messageSchema = z.object({
  body: z.string().trim().min(1, "Write something before sending."),
  isInternal: z.boolean().default(false),
  attachments: z
    .array(
      z.object({
        url: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number().int().nonnegative(),
      }),
    )
    .max(10)
    .default([]),
});

/**
 * POST /api/tickets/:id/messages — add a customer-facing reply or an internal
 * note. A reply is also delivered by email, threaded onto the existing
 * conversation.
 */
export const POST = withAuth<Ctx>(
  "tickets.write",
  async (req, { user, db, workspaceId }, { params }) => {
    const { id } = await params;
    const input = await parseBody(req, messageSchema);

    const ticket = await db.ticket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) throw notFound("That ticket doesn't exist.");

    const { message } = await addMessage({
      workspaceId,
      ticketId: id,
      authorType: "AGENT",
      actor: { id: user.id, name: user.name, role: user.role },
      body: input.body,
      isInternal: input.isInternal,
      attachments: input.attachments,
    });

    // Internal notes never leave the building.
    if (!input.isInternal) {
      await sendTicketReply({
        workspaceId,
        ticketId: id,
        messageId: message.id,
      }).catch((err) => {
        // Delivery failure must not lose the agent's reply — it is already
        // persisted. Surface it in the logs and let the outbox be retried.
        console.error("[email] reply delivery failed", err);
      });
    }

    return json({ message }, { status: 201 });
  },
);
