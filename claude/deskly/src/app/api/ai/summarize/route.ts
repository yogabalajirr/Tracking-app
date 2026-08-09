import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { aiGuard } from "@/lib/ai-route";
import { summarizeThread } from "@/lib/ai";

/**
 * Catch-up summary for a long thread.
 *
 * The cache is the `aiSummary` / `aiSummaryAt` pair on the ticket itself: a
 * summary is still valid exactly as long as no message has landed since it was
 * written. That is a real invalidation rule rather than a TTL guess, it costs
 * no extra infrastructure, and it survives a restart.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  ticketId: z.string().min(1),
  /** Force a fresh summary even if the cached one is still current. */
  refresh: z.boolean().default(false),
});

export const POST = withAuth("tickets.read", async (req, { user, db }) => {
  aiGuard(user.id, "summarize");

  const { ticketId, refresh } = await parseBody(req, bodySchema);

  const ticket = await db.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: {
      subject: true,
      status: true,
      aiSummary: true,
      aiSummaryAt: true,
      customer: { select: { name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          authorType: true,
          authorName: true,
          body: true,
          isInternal: true,
          createdAt: true,
        },
      },
    },
  });

  const lastMessageAt = ticket.messages.at(-1)?.createdAt ?? null;
  const cacheIsCurrent =
    !refresh &&
    ticket.aiSummary !== null &&
    ticket.aiSummaryAt !== null &&
    (lastMessageAt === null || ticket.aiSummaryAt >= lastMessageAt);

  if (cacheIsCurrent) {
    return json({
      summary: ticket.aiSummary,
      generatedAt: ticket.aiSummaryAt?.toISOString() ?? null,
      cached: true,
    });
  }

  const summary = await summarizeThread({
    subject: ticket.subject,
    customerName: ticket.customer.name ?? ticket.customer.email,
    status: ticket.status,
    messages: ticket.messages,
  });

  const generatedAt = new Date();
  await db.ticket.update({
    where: { id: ticketId },
    data: { aiSummary: summary, aiSummaryAt: generatedAt },
  });

  return json({ summary, generatedAt: generatedAt.toISOString(), cached: false });
});
