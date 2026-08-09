/**
 * Sends a fake inbound email at the webhook, so the whole email → ticket →
 * reply → reopen loop can be demoed on a laptop with no DNS and no provider.
 *
 *   npm run simulate:email -- --to support@agent.ticketflow.local \
 *                             --from rahul@northwind.test \
 *                             --subject "Printer is on fire"
 *
 * To thread a reply onto an existing ticket, pass the Message-ID the app sent
 * (you'll find it in ./storage/outbox/*.eml):
 *
 *   npm run simulate:email -- --to support@agent.ticketflow.local \
 *                             --from rahul@northwind.test \
 *                             --in-reply-to '<abc.def@ticketflow.local>' \
 *                             --body "Still broken!"
 */
import "dotenv/config";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const secret = process.env.INBOUND_WEBHOOK_SECRET ?? "dev-inbound-secret";
  const emailDomain = process.env.EMAIL_DOMAIN ?? "ticketflow.local";

  const to = String(args.to ?? `support@agent.${emailDomain}`);
  const from = String(args.from ?? "rahul@northwind.test");
  const fromName = String(args["from-name"] ?? "Rahul Verma");
  const subject = String(args.subject ?? "Trouble with my account");
  const body = String(
    args.body ??
      "Hi team,\n\nSomething isn't working as expected. Could you take a look?\n\nThanks,\nRahul",
  );
  const inReplyTo = args["in-reply-to"] ? String(args["in-reply-to"]) : undefined;

  const messageId = `<sim-${Date.now()}.${Math.random().toString(36).slice(2)}@northwind.test>`;

  const payload = {
    from: `"${fromName}" <${from}>`,
    to,
    subject,
    text: body,
    html: `<p>${body.replace(/\n/g, "<br />")}</p>`,
    messageId,
    ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}),
  };

  const endpoint = `${appUrl}/api/inbound/email?secret=${encodeURIComponent(secret)}`;
  console.log(`POST ${appUrl}/api/inbound/email`);
  console.log(`  to      ${to}`);
  console.log(`  from    ${fromName} <${from}>`);
  console.log(`  subject ${subject}`);
  if (inReplyTo) console.log(`  in-reply-to ${inReplyTo}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log(`\n${res.status} ${res.statusText}`);
  console.log(text);

  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
