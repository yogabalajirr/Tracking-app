import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { aiGuard } from "@/lib/ai-route";
import { suggestReplyStream } from "@/lib/ai";

/**
 * Streams a draft reply straight into the agent's composer as plain text.
 *
 * Plain text rather than SSE on purpose: the composer appends every chunk to a
 * textarea verbatim, so there is nothing to frame or parse. Nothing is sent to
 * the customer — the agent still has to read it and press send.
 */

export const runtime = "nodejs";
// Never let a proxy or the router buffer this; the whole point is early tokens.
export const dynamic = "force-dynamic";

const bodySchema = z.object({ ticketId: z.string().min(1) });

export const POST = withAuth("tickets.write", async (req, { user, db }) => {
  aiGuard(user.id, "suggest-reply");

  const { ticketId } = await parseBody(req, bodySchema);

  const ticket = await db.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: {
      subject: true,
      status: true,
      priority: true,
      customer: { select: { name: true, email: true } },
      workspace: { select: { name: true } },
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

  const stream = suggestReplyStream({
    subject: ticket.subject,
    customerName: ticket.customer.name ?? ticket.customer.email,
    agentName: user.name,
    workspaceName: ticket.workspace.name,
    status: ticket.status,
    priority: ticket.priority,
    messages: ticket.messages,
  });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(
            encoder.encode("\n\n[The model declined to draft a reply for this thread.]"),
          );
        }
      } catch (err) {
        console.error("[ai] suggest-reply stream failed", err);
        // The headers are long gone by now, so the only way to tell the agent
        // is in-band. They keep whatever text already arrived.
        controller.enqueue(encoder.encode("\n\n[Draft interrupted — please try again.]"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The agent navigated away or started typing: stop paying for tokens.
      stream.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
