import { z } from "zod";
import { json, parseBody, withPublic } from "@/lib/api";
import { prisma, tenantDb } from "@/lib/db";
import { verifyPortalToken } from "@/lib/tokens";
import { addMessage } from "@/lib/tickets";

type Ctx = { params: Promise<{ id: string }> };

const replySchema = z.object({
  body: z.string().trim().min(1, "Write something before sending.").max(20_000),
});

/**
 * POST /api/portal/ticket/:id/reply?token=…
 *
 * Unauthenticated but not unauthorised: the signed token is bound to this
 * exact ticket id, so possession of the link is what grants access. Rate
 * limited because it is public.
 */
export const POST = withPublic<Ctx>(
  { name: "portal-reply", limit: 20, windowMs: 60_000 },
  async (req, { params }) => {
    const { id } = await params!;

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token || !verifyPortalToken(token, id)) {
      return json({ error: "This link is no longer valid." }, { status: 403 });
    }

    const base = await prisma.ticket.findUnique({
      where: { id },
      select: { workspaceId: true },
    });
    if (!base) return json({ error: "That ticket no longer exists." }, { status: 404 });

    const input = await parseBody(req, replySchema);
    const db = tenantDb(base.workspaceId);

    const ticket = await db.ticket.findUniqueOrThrow({
      where: { id },
      include: { customer: { select: { name: true, email: true } } },
    });

    const { message, ticket: updated } = await addMessage({
      workspaceId: base.workspaceId,
      ticketId: id,
      authorType: "CUSTOMER",
      authorName: ticket.customer.name ?? ticket.customer.email,
      body: input.body,
    });

    return json(
      {
        ok: true,
        status: updated.status,
        message: {
          id: message.id,
          authorType: message.authorType,
          authorName: message.authorName,
          body: message.body,
          bodyHtml: message.bodyHtml,
          createdAt: message.createdAt,
          attachments: [],
        },
      },
      { status: 201 },
    );
  },
);
