import "server-only";
import { z } from "zod";

/**
 * Normalises the three inbound-webhook payload shapes we support into one
 * internal message. Providers disagree on casing and nesting, so the parsing
 * lives here rather than in the route handler.
 */

export type InboundEmail = {
  from: string;
  fromName: string | null;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: {
    filename: string;
    contentType: string;
    contentBase64: string;
  }[];
};

/** `"Jane Doe" <jane@example.com>` → name + address. */
export function parseAddress(raw: string): { email: string; name: string | null } {
  const value = (raw ?? "").trim();

  const angled = /^(.*?)<([^>]+)>\s*$/.exec(value);
  if (angled) {
    const name = angled[1].trim().replace(/^["']|["']$/g, "");
    return { email: angled[2].trim().toLowerCase(), name: name || null };
  }

  return { email: value.toLowerCase(), name: null };
}

function splitAddressList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => parseAddress(part).email)
    .filter(Boolean);
}

/** `<a@x> <b@y>` → ["<a@x>", "<b@y>"] */
function parseReferences(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.match(/<[^>]+>/g) ?? [];
}

// --- Postmark -------------------------------------------------------------

const postmarkSchema = z.object({
  From: z.string(),
  FromFull: z.object({ Email: z.string(), Name: z.string().optional() }).optional(),
  ToFull: z.array(z.object({ Email: z.string() })).optional(),
  To: z.string().optional(),
  Subject: z.string().optional(),
  TextBody: z.string().optional(),
  HtmlBody: z.string().optional(),
  MessageID: z.string().optional(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).optional(),
  Attachments: z
    .array(
      z.object({
        Name: z.string(),
        Content: z.string(),
        ContentType: z.string(),
      }),
    )
    .optional(),
});

// --- SendGrid Inbound Parse ----------------------------------------------

const sendgridSchema = z.object({
  from: z.string(),
  to: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  headers: z.string().optional(),
});

// --- Resend / generic -----------------------------------------------------

const genericSchema = z.object({
  from: z.union([z.string(), z.object({ email: z.string(), name: z.string().nullish() })]),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().nullish(),
  message_id: z.string().optional(),
  messageId: z.string().optional(),
  in_reply_to: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.union([z.string(), z.array(z.string())]).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.string(),
        content_type: z.string().optional(),
        contentType: z.string().optional(),
      }),
    )
    .optional(),
});

/** Pulls a header out of SendGrid's raw header blob. */
function headerFromRaw(raw: string | undefined, name: string): string | null {
  if (!raw) return null;
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const match = re.exec(raw);
  return match ? match[1].trim() : null;
}

export function parseInboundEmail(payload: unknown): InboundEmail | null {
  // --- Postmark ---
  const postmark = postmarkSchema.safeParse(payload);
  if (postmark.success && postmark.data.FromFull) {
    const d = postmark.data;
    const fromFull = postmark.data.FromFull;
    const headers = new Map(
      (d.Headers ?? []).map((h) => [h.Name.toLowerCase(), h.Value] as const),
    );

    return {
      from: fromFull.Email.toLowerCase(),
      fromName: fromFull.Name || null,
      to: d.ToFull?.map((t) => t.Email.toLowerCase()) ?? splitAddressList(d.To),
      subject: d.Subject ?? "(no subject)",
      text: d.TextBody ?? "",
      html: d.HtmlBody || null,
      messageId: headers.get("message-id") ?? (d.MessageID ? `<${d.MessageID}>` : null),
      inReplyTo: headers.get("in-reply-to") ?? null,
      references: parseReferences(headers.get("references")),
      attachments: (d.Attachments ?? []).map((a) => ({
        filename: a.Name,
        contentType: a.ContentType,
        contentBase64: a.Content,
      })),
    };
  }

  // --- SendGrid Inbound Parse ---
  const sendgrid = sendgridSchema.safeParse(payload);
  if (sendgrid.success && sendgrid.data.headers !== undefined) {
    const d = sendgrid.data;
    const sender = parseAddress(d.from);

    return {
      from: sender.email,
      fromName: sender.name,
      to: splitAddressList(d.to),
      subject: d.subject ?? "(no subject)",
      text: d.text ?? "",
      html: d.html || null,
      messageId: headerFromRaw(d.headers, "Message-Id"),
      inReplyTo: headerFromRaw(d.headers, "In-Reply-To"),
      references: parseReferences(headerFromRaw(d.headers, "References")),
      attachments: [],
    };
  }

  // --- Resend / generic JSON ---
  const generic = genericSchema.safeParse(payload);
  if (generic.success) {
    const d = generic.data;
    const sender =
      typeof d.from === "string"
        ? parseAddress(d.from)
        : { email: d.from.email.toLowerCase(), name: d.from.name ?? null };

    const to =
      typeof d.to === "string"
        ? splitAddressList(d.to)
        : (d.to ?? []).map((t) => parseAddress(t).email);

    const references =
      typeof d.references === "string"
        ? parseReferences(d.references)
        : (d.references ?? []);

    return {
      from: sender.email,
      fromName: sender.name,
      to,
      subject: d.subject ?? "(no subject)",
      text: d.text ?? "",
      html: d.html || null,
      messageId: d.message_id ?? d.messageId ?? null,
      inReplyTo: d.in_reply_to ?? d.inReplyTo ?? null,
      references,
      attachments: (d.attachments ?? []).map((a) => ({
        filename: a.filename,
        contentType: a.content_type ?? a.contentType ?? "application/octet-stream",
        contentBase64: a.content,
      })),
    };
  }

  return null;
}

/**
 * Extracts the workspace subdomain from a recipient address.
 * `support@acme.deskly.app` → `acme`
 *
 * Also accepts the plus-addressing form `support+acme@deskly.app`, which is
 * what most people can set up without owning a wildcard MX record.
 */
export function subdomainFromRecipient(
  recipients: string[],
  emailDomain: string,
): string | null {
  const domain = emailDomain.toLowerCase();

  for (const address of recipients) {
    const [local, host] = address.toLowerCase().split("@");
    if (!host) continue;

    if (host.endsWith(`.${domain}`)) {
      const sub = host.slice(0, -(domain.length + 1));
      if (sub && !sub.includes(".")) return sub;
    }

    if (host === domain) {
      const plus = local.indexOf("+");
      if (plus > -1) {
        const tag = local.slice(plus + 1);
        if (tag) return tag;
      }
    }
  }

  return null;
}

/**
 * Our outbound Message-IDs embed the ticket id:
 * `<messageId.ticketId@domain>`. Recovering it from In-Reply-To/References is
 * the most reliable way to thread a reply, since subjects get edited.
 */
export function ticketIdFromMessageId(
  messageId: string | null,
  emailDomain: string,
): string | null {
  if (!messageId) return null;

  const match = new RegExp(
    `<[^.>]+\\.([^.@>]+)@${emailDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`,
    "i",
  ).exec(messageId);

  return match ? match[1] : null;
}

/** `Re: Re: Fwd: Broken thing` → `Broken thing` */
export function normaliseSubject(subject: string): string {
  return subject.replace(/^((re|fwd|fw|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
}

/** `[#42]` in a subject line — the last-resort threading hint. */
export function ticketNumberFromSubject(subject: string): number | null {
  const match = /\[#(\d+)\]|#(\d+)/.exec(subject);
  if (!match) return null;
  const value = Number(match[1] ?? match[2]);
  return Number.isFinite(value) ? value : null;
}
