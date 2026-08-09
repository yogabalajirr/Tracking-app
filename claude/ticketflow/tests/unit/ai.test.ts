import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_CATEGORIES,
  AiDisabledError,
  renderTranscript,
  shouldEscalate,
  summarizeThread,
  type ThreadMessage,
} from "../../src/lib/ai";

/**
 * The AI layer's testable surface: transcript rendering (what actually leaves
 * the building), the escalation rule, and the no-key behaviour. The model calls
 * themselves are exercised by `scripts/verify-ai.ts` when a key is present.
 */

function msg(over: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    authorType: "CUSTOMER",
    authorName: "Ravi",
    body: "Hello",
    isInternal: false,
    createdAt: new Date("2026-01-05T10:00:00Z"),
    ...over,
  };
}

// --- Transcript rendering -------------------------------------------------

test("labels each turn with who wrote it", () => {
  const out = renderTranscript([
    msg({ body: "My invoice is wrong." }),
    msg({ authorType: "AGENT", authorName: "Priya", body: "Looking into it." }),
  ]);

  assert.match(out, /Customer \(Ravi\):\nMy invoice is wrong\./);
  assert.match(out, /Agent \(Priya\):\nLooking into it\./);
});

test("marks internal notes so the model knows not to quote them", () => {
  const out = renderTranscript([
    msg({ authorType: "AGENT", authorName: "Priya", body: "Refund approved.", isInternal: true }),
  ]);

  assert.match(out, /Agent \(Priya\) — INTERNAL NOTE:/);
});

test("falls back to 'unknown' rather than printing null", () => {
  const out = renderTranscript([msg({ authorName: null })]);

  assert.match(out, /Customer \(unknown\):/);
  assert.doesNotMatch(out, /null/);
});

test("names the system author without inventing a person", () => {
  const out = renderTranscript([msg({ authorType: "SYSTEM", authorName: null, body: "Reopened." })]);

  assert.match(out, /^System:\nReopened\.$/);
});

test("truncates a runaway message instead of shipping the whole thing", () => {
  const out = renderTranscript([msg({ body: "x".repeat(5_000) })]);

  assert.ok(out.includes("…[truncated]"));
  assert.ok(out.length < 2_200, `transcript was ${out.length} chars`);
});

test("keeps only the most recent turns of a very long thread", () => {
  const messages = Array.from({ length: 40 }, (_, i) => msg({ body: `turn ${i}` }));
  const out = renderTranscript(messages);

  assert.ok(out.includes("turn 39"), "the newest turn must survive");
  assert.ok(out.includes("turn 20"), "the window should hold the last 20");
  assert.ok(!out.includes("turn 19"), "anything older is dropped");
});

test("normalises CRLF so the transcript is not double-spaced", () => {
  const out = renderTranscript([msg({ body: "line one\r\nline two" })]);

  assert.ok(!out.includes("\r"));
  assert.ok(out.includes("line one\nline two"));
});

test("an empty thread renders as an empty string, not 'undefined'", () => {
  assert.equal(renderTranscript([]), "");
});

// --- Escalation rule ------------------------------------------------------

test("triage may raise a priority", () => {
  assert.equal(shouldEscalate("NORMAL", "URGENT"), true);
  assert.equal(shouldEscalate("LOW", "NORMAL"), true);
  assert.equal(shouldEscalate("HIGH", "URGENT"), true);
});

test("triage may never lower a priority a human already set", () => {
  assert.equal(shouldEscalate("URGENT", "LOW"), false);
  assert.equal(shouldEscalate("HIGH", "NORMAL"), false);
  assert.equal(shouldEscalate("URGENT", "HIGH"), false);
});

test("an agreeing model changes nothing", () => {
  for (const p of ["LOW", "NORMAL", "HIGH", "URGENT"] as const) {
    assert.equal(shouldEscalate(p, p), false);
  }
});

// --- Categories -----------------------------------------------------------

test("categories are a closed, lower-case set so reports stay groupable", () => {
  assert.ok(AI_CATEGORIES.includes("other"), "there must be an escape hatch");
  assert.equal(new Set(AI_CATEGORIES).size, AI_CATEGORIES.length, "no duplicates");
  for (const c of AI_CATEGORIES) {
    assert.match(c, /^[a-z-]+$/, `${c} should be a tag-safe slug`);
  }
});

// --- Degradation ----------------------------------------------------------

test("with no API key the helpers refuse loudly rather than half-working", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  // `env()` validates the whole config, so give it the minimum it insists on;
  // nothing here opens a connection.
  process.env.DATABASE_URL ??= "postgresql://localhost:5432/unused";
  process.env.APP_SECRET ??= "0".repeat(32);

  try {
    await assert.rejects(
      () =>
        summarizeThread({
          subject: "Anything",
          customerName: "Ravi",
          status: "OPEN",
          messages: [msg()],
        }),
      AiDisabledError,
    );
  } finally {
    if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
  }
});
