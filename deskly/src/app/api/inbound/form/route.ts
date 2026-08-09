import { z } from "zod";
import { json, parseBody, withPublic } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createTicket } from "@/lib/tickets";
import { sendTicketReceipt } from "@/lib/email/send";
import { portalUrl } from "@/lib/tokens";
import { emailSchema, nameSchema } from "@/lib/validation";

/** CORS: the widget is embedded on the customer's own site, so any origin. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const formSchema = z.object({
  workspace: z.string().trim().min(1, "Missing workspace."),
  name: nameSchema.optional(),
  email: emailSchema,
  subject: z.string().trim().min(1, "Please give your request a subject.").max(300),
  message: z.string().trim().min(1, "Please describe your request.").max(20_000),
  category: z.string().trim().max(40).optional(),
  /**
   * Honeypot: bots fill hidden fields, humans don't. Deliberately permissive
   * here — rejecting it in validation would tell a bot the field is a trap.
   * The handler quietly accepts and discards instead.
   */
  website: z.string().max(200).optional(),
});

/**
 * POST /api/inbound/form — the embeddable contact widget.
 *
 * Public and CORS-open by design, so it is rate limited per IP and carries a
 * honeypot field. The workspace is named by subdomain rather than an id so the
 * embed snippet is readable.
 */
export const POST = withPublic(
  { name: "inbound-form", limit: 10, windowMs: 60_000 },
  async (req) => {
    const input = await parseBody(req, formSchema);

    // Silently accept honeypot hits so bots get no signal.
    //
    // The status has to match the real success path (201, not 200): a bot that
    // sees a different code learns exactly which field is the trap and stops
    // filling it in. The body is still thinner than a genuine response — we
    // will not fabricate a ticket number to hide that — but nothing here tells
    // a scripted submitter it was caught.
    if (input.website) {
      return json({ ok: true }, { status: 201, headers: CORS_HEADERS });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { subdomain: input.workspace.toLowerCase() },
      select: { id: true },
    });

    if (!workspace) {
      return json(
        { error: "We couldn't find that support desk." },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const ticket = await createTicket({
      workspaceId: workspace.id,
      subject: input.subject,
      body: input.message,
      channel: "FORM",
      customer: { email: input.email, name: input.name ?? null },
      tagNames: input.category ? [input.category] : [],
    });

    await sendTicketReceipt({ workspaceId: workspace.id, ticketId: ticket.id }).catch((err) =>
      console.error("[form] receipt failed", err),
    );

    return json(
      {
        ok: true,
        ticketNumber: ticket.number,
        trackUrl: portalUrl(ticket.id),
      },
      { status: 201, headers: CORS_HEADERS },
    );
  },
);
