import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

/**
 * Outbound email, behind a small adapter so the product does not depend on any
 * one vendor — and so it works with no vendor at all.
 *
 * The `console` driver writes RFC-822 files to ./storage/outbox. That is the
 * default because it lets the whole email loop (reply → threading → reopen) be
 * demoed on a laptop with no DNS, no API key and no internet.
 */

export type OutboundEmail = {
  to: string;
  toName?: string | null;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  /** RFC 5322 headers that keep replies threaded onto the same ticket. */
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export type SendResult = { id: string; provider: string };

export interface EmailProvider {
  readonly name: string;
  send(email: OutboundEmail): Promise<SendResult>;
}

// --- console --------------------------------------------------------------

const OUTBOX_DIR = "./storage/outbox";

class ConsoleProvider implements EmailProvider {
  readonly name = "console";

  async send(email: OutboundEmail): Promise<SendResult> {
    const id = email.messageId ?? `<${Date.now()}.${Math.random().toString(36).slice(2)}@local>`;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeTo = email.to.replace(/[^a-z0-9@._-]/gi, "_");

    const headers = [
      `Date: ${new Date().toUTCString()}`,
      `From: ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}`,
      `To: ${email.toName ? `${email.toName} <${email.to}>` : email.to}`,
      email.replyTo ? `Reply-To: ${email.replyTo}` : null,
      `Subject: ${email.subject}`,
      `Message-ID: ${id}`,
      email.inReplyTo ? `In-Reply-To: ${email.inReplyTo}` : null,
      email.references ? `References: ${email.references}` : null,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
    ].filter(Boolean);

    const contents = `${headers.join("\n")}\n\n${email.text}\n`;

    await fs.mkdir(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, `${stamp}--${safeTo}.eml`);
    await fs.writeFile(file, contents, "utf8");

    console.log(`[email:console] wrote ${file} — "${email.subject}" → ${email.to}`);
    return { id, provider: this.name };
  }
}

// --- resend ---------------------------------------------------------------

class ResendProvider implements EmailProvider {
  readonly name = "resend";

  constructor(private readonly apiKey: string) {}

  async send(email: OutboundEmail): Promise<SendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.fromName ? `${email.fromName} <${email.from}>` : email.from,
        to: [email.to],
        reply_to: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: {
          ...(email.messageId ? { "Message-ID": email.messageId } : {}),
          ...(email.inReplyTo ? { "In-Reply-To": email.inReplyTo } : {}),
          ...(email.references ? { References: email.references } : {}),
        },
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Resend rejected the message (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { id?: string };
    return { id: data.id ?? email.messageId ?? "", provider: this.name };
  }
}

// --- postmark -------------------------------------------------------------

class PostmarkProvider implements EmailProvider {
  readonly name = "postmark";

  constructor(private readonly token: string) {}

  async send(email: OutboundEmail): Promise<SendResult> {
    const headers: { Name: string; Value: string }[] = [];
    if (email.messageId) headers.push({ Name: "Message-ID", Value: email.messageId });
    if (email.inReplyTo) headers.push({ Name: "In-Reply-To", Value: email.inReplyTo });
    if (email.references) headers.push({ Name: "References", Value: email.references });

    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": this.token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: email.fromName ? `${email.fromName} <${email.from}>` : email.from,
        To: email.to,
        ReplyTo: email.replyTo,
        Subject: email.subject,
        TextBody: email.text,
        HtmlBody: email.html,
        Headers: headers,
        MessageStream: "outbound",
        Attachments: email.attachments?.map((a) => ({
          Name: a.filename,
          Content: a.content.toString("base64"),
          ContentType: a.contentType,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Postmark rejected the message (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { MessageID?: string };
    return { id: data.MessageID ?? email.messageId ?? "", provider: this.name };
  }
}

// --- smtp -----------------------------------------------------------------

class SmtpProvider implements EmailProvider {
  readonly name = "smtp";

  async send(email: OutboundEmail): Promise<SendResult> {
    const cfg = env();
    // Imported lazily so the dependency is only loaded when SMTP is selected.
    const nodemailer = await import("nodemailer");

    const transport = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE,
      auth:
        cfg.SMTP_USER && cfg.SMTP_PASSWORD
          ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASSWORD }
          : undefined,
    });

    const info = await transport.sendMail({
      from: email.fromName ? `"${email.fromName}" <${email.from}>` : email.from,
      to: email.toName ? `"${email.toName}" <${email.to}>` : email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
      messageId: email.messageId,
      inReplyTo: email.inReplyTo,
      references: email.references,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    return { id: info.messageId ?? email.messageId ?? "", provider: this.name };
  }
}

// --- factory --------------------------------------------------------------

let cached: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (cached) return cached;

  const cfg = env();
  switch (cfg.EMAIL_PROVIDER) {
    case "resend":
      if (!cfg.RESEND_API_KEY) {
        throw new Error("EMAIL_PROVIDER=resend but RESEND_API_KEY is not set.");
      }
      cached = new ResendProvider(cfg.RESEND_API_KEY);
      break;
    case "postmark":
      if (!cfg.POSTMARK_SERVER_TOKEN) {
        throw new Error("EMAIL_PROVIDER=postmark but POSTMARK_SERVER_TOKEN is not set.");
      }
      cached = new PostmarkProvider(cfg.POSTMARK_SERVER_TOKEN);
      break;
    case "smtp":
      if (!cfg.SMTP_HOST) {
        throw new Error("EMAIL_PROVIDER=smtp but SMTP_HOST is not set.");
      }
      cached = new SmtpProvider();
      break;
    default:
      cached = new ConsoleProvider();
  }

  return cached;
}

/** Test hook — forces the factory to re-read configuration. */
export function __resetEmailProvider() {
  cached = null;
}
