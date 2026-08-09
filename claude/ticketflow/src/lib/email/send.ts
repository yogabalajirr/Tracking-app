import "server-only";
import { prisma, tenantDb } from "../db";
import { env, supportAddress } from "../env";
import { escapeHtml } from "../sanitize";
import { portalUrl } from "../tokens";
import { emailProvider } from "./provider";

/**
 * Ticket email is threaded with RFC 5322 headers rather than by stuffing an id
 * into the subject line: we mint a stable Message-ID per outbound message and
 * echo the customer's Message-ID back in In-Reply-To/References. Mail clients
 * then keep everything in one conversation, and the inbound webhook can match
 * a reply to its ticket even if the subject was edited.
 */

function messageIdFor(ticketId: string, messageId: string): string {
  return `<${messageId}.${ticketId}@${env().EMAIL_DOMAIN}>`;
}

/** Sends an agent's reply to the customer, correctly threaded. */
export async function sendTicketReply(input: {
  workspaceId: string;
  ticketId: string;
  messageId: string;
}) {
  const db = tenantDb(input.workspaceId);

  const [workspace, ticket, message] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: input.workspaceId },
      select: { name: true, subdomain: true },
    }),
    db.ticket.findUniqueOrThrow({
      where: { id: input.ticketId },
      include: { customer: true },
    }),
    db.message.findUniqueOrThrow({
      where: { id: input.messageId },
      include: { attachments: true },
    }),
  ]);

  // Thread onto the most recent message that carries an email Message-ID.
  const priorMessages = await db.message.findMany({
    where: {
      ticketId: input.ticketId,
      emailMessageId: { not: null },
      id: { not: input.messageId },
    },
    orderBy: { createdAt: "asc" },
    select: { emailMessageId: true },
  });

  const priorIds = priorMessages
    .map((m) => m.emailMessageId)
    .filter((v): v is string => Boolean(v));

  const ourMessageId = messageIdFor(ticket.id, message.id);
  const inReplyTo = priorIds.at(-1);
  const references = priorIds.join(" ") || undefined;

  const from = supportAddress(workspace.subdomain);
  const link = portalUrl(ticket.id);

  const subject = ticket.subject.startsWith("Re:")
    ? ticket.subject
    : `Re: ${ticket.subject}`;

  const footer =
    `\n\n---\nTicket #${ticket.number} · ${workspace.name}\n` +
    `View or reply online: ${link}\n` +
    `You can also just reply to this email.`;

  const result = await emailProvider().send({
    to: ticket.customer.email,
    toName: ticket.customer.name,
    from,
    fromName: `${message.authorName ?? "Support"} · ${workspace.name}`,
    replyTo: from,
    subject,
    text: message.body + footer,
    html: buildHtml({
      body: message.bodyHtml ?? `<p>${escapeHtml(message.body)}</p>`,
      workspaceName: workspace.name,
      ticketNumber: ticket.number,
      portalLink: link,
    }),
    messageId: ourMessageId,
    inReplyTo,
    references,
  });

  // Record the id we sent under so a reply's In-Reply-To resolves back here.
  await db.message.update({
    where: { id: message.id },
    data: { emailMessageId: ourMessageId },
  });

  return result;
}

/** Notifies a customer that their ticket was created. */
export async function sendTicketReceipt(input: {
  workspaceId: string;
  ticketId: string;
}) {
  const db = tenantDb(input.workspaceId);

  const [workspace, ticket] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: input.workspaceId },
      select: { name: true, subdomain: true },
    }),
    db.ticket.findUniqueOrThrow({
      where: { id: input.ticketId },
      include: { customer: true },
    }),
  ]);

  const from = supportAddress(workspace.subdomain);
  const link = portalUrl(ticket.id);

  const text =
    `Hi${ticket.customer.name ? ` ${ticket.customer.name}` : ""},\n\n` +
    `Thanks for getting in touch. We've logged your request as ticket #${ticket.number} ` +
    `and someone from the team will reply shortly.\n\n` +
    `Subject: ${ticket.subject}\n\n` +
    `Track it here: ${link}\n\n` +
    `— ${workspace.name}`;

  return emailProvider().send({
    to: ticket.customer.email,
    toName: ticket.customer.name,
    from,
    fromName: workspace.name,
    replyTo: from,
    subject: `[#${ticket.number}] We've got your request: ${ticket.subject}`,
    text,
    html: buildHtml({
      body: `<p>Hi${ticket.customer.name ? ` ${escapeHtml(ticket.customer.name)}` : ""},</p>
             <p>Thanks for getting in touch. We've logged your request as
             <strong>ticket #${ticket.number}</strong> and someone from the team will
             reply shortly.</p>
             <p><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>`,
      workspaceName: workspace.name,
      ticketNumber: ticket.number,
      portalLink: link,
    }),
    messageId: messageIdFor(ticket.id, `receipt-${ticket.id}`),
  });
}

/** Emails a workspace invite with its magic link. */
export async function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  inviterName: string;
  token: string;
  role: string;
}) {
  const link = `${env().APP_URL}/invite/${input.token}`;

  const text =
    `${input.inviterName} has invited you to join the ${input.workspaceName} ` +
    `support desk on TicketFlow as ${input.role.toLowerCase()}.\n\n` +
    `Accept the invite: ${link}\n\n` +
    `This link expires in 7 days.`;

  return emailProvider().send({
    to: input.to,
    from: `no-reply@${env().EMAIL_DOMAIN}`,
    fromName: "TicketFlow",
    subject: `Join ${input.workspaceName} on TicketFlow`,
    text,
    html: buildHtml({
      body: `<p><strong>${escapeHtml(input.inviterName)}</strong> has invited you to join the
             <strong>${escapeHtml(input.workspaceName)}</strong> support desk as
             ${escapeHtml(input.role.toLowerCase())}.</p>
             <p><a href="${link}">Accept the invite</a></p>
             <p style="color:#6b7280;font-size:13px">This link expires in 7 days.</p>`,
      workspaceName: input.workspaceName,
    }),
  });
}

/** Emails an SLA warning or breach to the assignee. */
export async function sendSlaAlert(input: {
  to: string;
  agentName: string;
  workspaceName: string;
  ticketId: string;
  ticketNumber: number;
  subject: string;
  breached: boolean;
  dueAt: Date;
}) {
  const link = `${env().APP_URL}/inbox/${input.ticketId}`;
  const headline = input.breached
    ? `SLA breached on ticket #${input.ticketNumber}`
    : `SLA at 75% on ticket #${input.ticketNumber}`;

  const text =
    `Hi ${input.agentName},\n\n${headline}.\n\n` +
    `Subject: ${input.subject}\n` +
    `Target: ${input.dueAt.toISOString()}\n\n` +
    `Open the ticket: ${link}`;

  return emailProvider().send({
    to: input.to,
    from: `no-reply@${env().EMAIL_DOMAIN}`,
    fromName: `TicketFlow · ${input.workspaceName}`,
    subject: headline,
    text,
    html: buildHtml({
      body: `<p>Hi ${escapeHtml(input.agentName)},</p>
             <p>${escapeHtml(headline)}.</p>
             <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
             <p><a href="${link}">Open the ticket</a></p>`,
      workspaceName: input.workspaceName,
      ticketNumber: input.ticketNumber,
    }),
  });
}

/** Minimal, client-safe HTML wrapper — inline styles only, no external assets. */
function buildHtml(input: {
  body: string;
  workspaceName: string;
  ticketNumber?: number;
  portalLink?: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb">
      <div style="font-size:15px;line-height:1.6">${input.body}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
      <div style="font-size:12px;color:#6b7280">
        ${input.ticketNumber ? `Ticket #${input.ticketNumber} · ` : ""}${escapeHtml(input.workspaceName)}
        ${input.portalLink ? `<br /><a href="${input.portalLink}" style="color:#1e1e1e">View or reply online</a> — or just reply to this email.` : ""}
      </div>
    </div>
  </body>
</html>`;
}
