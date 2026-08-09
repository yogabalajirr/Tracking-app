/**
 * AI layer proof.
 *
 *   npm run verify:ai
 *
 * With no ANTHROPIC_API_KEY this verifies the degradation path — the one that
 * matters most, because it is the default configuration. With a key set it also
 * does a live round-trip through all three helpers against a throwaway
 * workspace, so a model or SDK change surfaces here rather than in the UI.
 */
import "dotenv/config";
import { prisma, tenantDb } from "../src/lib/db";
import { provisionWorkspace } from "../src/lib/workspace";
import { createTicket, addMessage } from "../src/lib/tickets";
import { triageTicket } from "../src/lib/ai-triage";
import { AiDisabledError, renderTranscript, summarizeThread, suggestReplyStream } from "../src/lib/ai";
import { aiEnabled, env } from "../src/lib/env";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const stamp = Date.now();
  const live = aiEnabled();

  console.log(
    live
      ? `\nAI enabled — live round-trip against ${env().ANTHROPIC_MODEL}\n`
      : "\nNo ANTHROPIC_API_KEY — verifying the degradation path\n",
  );

  const { workspace } = await provisionWorkspace({
    workspaceName: "AI Check",
    subdomain: `ai-${stamp}`,
    timezone: "UTC",
    ownerName: "Owner",
    ownerEmail: `ai-owner-${stamp}@example.test`,
    ownerPassword: "verify-ai-password",
  });

  const db = tenantDb(workspace.id);

  const ticket = await createTicket({
    workspaceId: workspace.id,
    subject: "Charged twice for the October invoice",
    body: [
      "Hi — we were billed 4,800 twice on 3 October for invoice INV-2291.",
      "The second charge has already cleared and our finance team needs it back before month end.",
    ].join("\n"),
    channel: "EMAIL",
    customer: { email: `ai-customer-${stamp}@example.test`, name: "Ravi Menon" },
    skipRules: true,
  });

  await addMessage({
    workspaceId: workspace.id,
    ticketId: ticket.id,
    body: "Confirmed the duplicate in the payment gateway — waiting on finance to approve the reversal.",
    authorType: "AGENT",
    isInternal: true,
    actor: null,
  });

  // --- Transcript ---------------------------------------------------------

  const detail = await db.ticket.findUniqueOrThrow({
    where: { id: ticket.id },
    select: {
      subject: true,
      status: true,
      priority: true,
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

  const transcript = renderTranscript(detail.messages);
  check("transcript includes the customer's opening message", transcript.includes("INV-2291"));
  check("transcript flags the internal note", transcript.includes("INTERNAL NOTE"));

  if (!live) {
    // --- Degradation ------------------------------------------------------

    let threw: unknown = null;
    try {
      await summarizeThread({
        subject: detail.subject,
        customerName: "Ravi Menon",
        status: detail.status,
        messages: detail.messages,
      });
    } catch (err) {
      threw = err;
    }
    check("summarizeThread throws AiDisabledError", threw instanceof AiDisabledError);

    const triage = await triageTicket(workspace.id, ticket.id);
    check("triageTicket reports not-applied instead of throwing", triage.applied === false);
    check("triage leaves the classification empty", triage.classification === null);

    const untouched = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { aiCategory: true, aiSummary: true, priority: true },
    });
    check("ticket is left completely unmodified", untouched.aiCategory === null);
    check("no summary is written", untouched.aiSummary === null);
    check("priority is untouched", untouched.priority === "NORMAL");
  } else {
    // --- Live round-trip --------------------------------------------------

    const summary = await summarizeThread({
      subject: detail.subject,
      customerName: "Ravi Menon",
      status: detail.status,
      messages: detail.messages,
    });
    check("summary comes back non-empty", summary.length > 20, `${summary.length} chars`);
    check("summary is bulleted as asked", summary.trimStart().startsWith("-"), summary.slice(0, 40));
    check("summary stays brief", summary.split(/\s+/).length < 200);

    const triage = await triageTicket(workspace.id, ticket.id);
    check("triage applied", triage.applied === true);
    check(
      "triage picked the billing category",
      triage.classification?.category === "billing",
      String(triage.classification?.category),
    );

    const tagged = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { aiCategory: true, priority: true, tags: { select: { name: true } } },
    });
    check("category written to the ticket", tagged.aiCategory === triage.classification?.category);
    check(
      "category also added as a tag",
      tagged.tags.some((t) => t.name === triage.classification?.category),
      tagged.tags.map((t) => t.name).join(", "),
    );

    const aiActivity = await db.activity.findMany({
      where: { ticketId: ticket.id, type: "AI_TAGGED" },
    });
    check("triage is recorded in the activity log", aiActivity.length === 1);
    check("activity is attributed to Claude, not a human", aiActivity[0]?.actorName === "Claude");

    let draft = "";
    const stream = suggestReplyStream({
      subject: detail.subject,
      customerName: "Ravi Menon",
      agentName: "Priya Nair",
      workspaceName: "AI Check",
      status: detail.status,
      priority: tagged.priority,
      messages: detail.messages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        draft += event.delta.text;
      }
    }

    check("reply draft streamed back", draft.length > 40, `${draft.length} chars`);
    check("draft signs off as the agent", draft.includes("Priya"), draft.slice(-60));
    check(
      "draft does not leak the internal note verbatim",
      !draft.includes("waiting on finance to approve the reversal"),
    );
  }

  await prisma.workspace.delete({ where: { id: workspace.id } });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
