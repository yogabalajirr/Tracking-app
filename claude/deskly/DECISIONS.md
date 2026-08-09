# Decisions

The choices that aren't obvious from reading the code, and what they cost.

---

## Multi-tenancy: `workspaceId` on every table, enforced by a Prisma extension

`Ticket` could reach its workspace through `Customer`, and `Message` through
`Ticket`. Instead every tenant table carries `workspaceId` directly.

That redundancy is what makes the guard uniform. `tenantDb(workspaceId)` in
`src/lib/db.ts` wraps the client in an extension that merges `workspaceId` into
the `where` of every read *and* every write, and into the `data` of every
create. Because the column is always top-level, the extension never has to know
what a model is related to — it applies the same rule to all of them.

The important part is that the filter goes into `where` rather than being
checked after the fact. Prisma 5+ allows non-unique filters alongside a unique
selector (`extendedWhereUnique`), so a cross-tenant `update` or `delete` fails
with `P2025` **before** touching the row. A post-hoc check would have been too
late for exactly the operations that matter.

Route handlers receive the scoped client from `withAuth` and never see the raw
one. `TenantIsolationError` maps to **404, not 403** — a 403 would confirm the
id exists in some other workspace.

*Cost:* every tenant table needs the column, and TypeScript cannot see the
runtime injection, so `create` calls still pass `workspaceId` explicitly. The
extension remains the thing that actually enforces it — `verify:isolation`
proves a deliberately smuggled `workspaceId` is overridden.

*Alternative rejected:* PostgreSQL row-level security. Stronger, but it moves
the rule into migrations where the application can't see it, and it needs a
per-request `SET LOCAL`, which is awkward with a connection pool.

---

## SLA maths in business time, in its own module

`src/lib/business-hours.ts` computes elapsed and remaining minutes inside the
workspace's configured hours, in the workspace's timezone, across weekends and
DST transitions. Everything is stored UTC and rendered in workspace time.

It imports nothing server-only — no database, no `server-only` — purely so it
can be unit-tested directly. 18 of the unit tests are about this file, because
"the SLA fired at the wrong time" is the kind of bug you find out about from a
customer.

The 75% warning threshold is a constant (`SLA_WARNING_THRESHOLD`), and the
warning and breach are each recorded with a timestamp on the ticket
(`firstResponseWarnedAt`, `firstResponseBreached`, and their resolution
equivalents) so an alert fires exactly once regardless of how often the sweep
runs.

---

## The SLA sweep is a polling worker, not a scheduler

`scripts/worker.ts` polls every 30 seconds. No queue, no cron, no external
scheduler.

An SLA breach is a *time* becoming true, not an event, so something has to
notice. Polling makes that something one loop with no infrastructure behind it,
and the sweep is idempotent — running two workers just does the work twice.

*Cost:* alerts can be up to 30 seconds late. For a first-response target
measured in hours, that is irrelevant.

---

## Email threading on Message-ID, with a guarded subject fallback

Outbound mail carries a Message-ID of the form
`<messageId.ticketId@domain>`. When a customer replies, the ticket id is
recovered from `In-Reply-To` or `References`.

That is the only threading signal that survives a customer editing the subject
line, which they do constantly.

The `[#42]` subject marker is a last-resort fallback, and it is **only honoured
when the sender's address matches the ticket's customer**. Without that
condition, anyone could inject a message into someone else's ticket by guessing
a number. There's an e2e test for exactly that attempt.

Inbound is idempotent on Message-ID, because providers retry.

---

## The console email driver is the default

`EMAIL_PROVIDER=console` writes `.eml` files to `./storage/outbox`. It is the
default so that a fresh clone demonstrates the entire email loop — outbound
receipt, reply, threading, reopen — with no account, no API key and no network.
`npm run simulate:email` posts inbound mail at the webhook to close the loop.

Resend, Postmark and SMTP are adapters behind the same interface.

---

## Real-time over SSE and an in-process event bus

`src/lib/events.ts` is an EventEmitter; `/api/events` streams from it over
Server-Sent Events. No Redis, no WebSocket server.

Deskly's shape is a single Node process — the macOS app, or one container. For
that shape this is the whole feature in about forty lines. Updates are
one-directional (server to client), which is exactly what SSE is for, and it
reconnects on its own.

*Cost:* it does not survive horizontal scaling. `publish()` and `subscribe()`
are the only two functions that would change; the call sites would not.

The same reasoning applies to the in-memory rate limiter in
`src/lib/rate-limit.ts` — swap the body of `hit()` for a Redis `INCR`+`EXPIRE`
and nothing else moves.

---

## Routing rules apply top-down, all matches, not first-match

Every active rule that matches is applied in priority order; later actions
override earlier ones and tags accumulate. First-match-wins is more predictable
in isolation but forces people to write one enormous rule per outcome. The cap
of 20 active rules keeps the evaluation honest.

A rule naming an agent or team from another workspace, or a stale id, is
discarded at apply time rather than trusted.

---

## Round-robin is load-balanced, not positional

`pickRoundRobinAssignee` picks the agent with the fewest *active* tickets rather
than cycling through a list. Positional round-robin looks fair and isn't: an
agent who happens to draw four long-running tickets keeps receiving new ones on
schedule.

This surprised us during testing — three tickets in a row went to one agent —
so `verify:routing` now proves an even split from an even starting point, and
that an uneven start converges instead of alternating.

---

## AI is optional, additive, and never destructive

Model calls sit behind `ANTHROPIC_API_KEY`. With no key the routes return a
clean 503, the buttons don't render, auto-triage is skipped, and the Anthropic
SDK is never even loaded — auto-triage is imported dynamically on the ticket
path for exactly that reason.

Three rules constrain what the model is allowed to do:

1. **Triage may raise a priority, never lower one.** A model that can quietly
   downgrade an URGENT ticket is a liability; one that escalates a missed
   emergency is the point. The rule is asymmetric on purpose
   (`shouldEscalate` in `src/lib/ai.ts`).
2. **Its opinion stays attributable.** The category is written to `aiCategory`
   and added as a tag, and every run is logged as an `AI_TAGGED` activity
   attributed to Claude, not to a human.
3. **It never talks to a customer.** Reply drafts stream into the agent's
   composer for editing. Nothing is sent automatically.

Ticket creation never waits on a model call — triage is fire-and-forget, so a
slow or failing request can't delay or fail a customer's submission.

Summaries cache in `aiSummary`/`aiSummaryAt` and are valid exactly until the
next message lands. That's a real invalidation rule rather than a TTL guess,
costs no extra infrastructure, and survives a restart.

The thread transcript sent to the model includes internal notes — that's the
context an agent reads before replying — but the prompt forbids quoting them
back, and the transcript is capped at 20 turns and 2k characters per message.
The prompt also states plainly that the transcript is data, not instructions.

**Model:** `claude-opus-5` with adaptive thinking. The original brief named a
Sonnet build; Opus 5 is the current default and the difference is invisible to
the app, since the model id is a single environment variable
(`ANTHROPIC_MODEL`).

---

## Auth: session cookies, not JWTs

Sessions are opaque tokens in an HTTP-only cookie, hashed at rest, looked up
per request. Revocation is a `DELETE`. Statelessness buys nothing here — every
request already touches the database.

Portal links and invites are HMAC-signed tokens with expiry, so a customer can
read and reply to their ticket without an account and without a password reset
flow existing at all.

---

## Desktop: Electron around the standalone server

The macOS app runs the same Next standalone server as a child process and
points a window at it. Not a rewrite, not a WebView wrapper around a hosted
site: one codebase, and the desktop app works offline against a local
PostgreSQL.

`electron/server.js` holds everything with logic — port selection, spawning,
health polling, shutdown — and imports nothing from `electron`, so it is
testable under plain Node. `main.js` is only the window.

The renderer is sandboxed with context isolation and the preload exposes two
facts and no capabilities.

*Cost:* PostgreSQL is a prerequisite rather than something bundled inside the
app. `setup:mac` installs it. Embedding a database engine would make the app
self-contained but would also mean a different database in development and
production, which is a worse trade for a product whose queries include
full-text search.

---

## Colour: "Sharp edge", with status doing the talking

The palette is four stops — `#898989`, `#D9D9D9`, `#FF4D4D`, `#4DFFBC`. Greys
carry every structural job; the red and the mint are spent only on state.

That split is why it suits this product. A support queue has exactly two poles
worth shouting about — an SLA breaching and an SLA met — so the two vivid hues
mean something. Keeping the primary button neutral graphite rather than
coloured is what leaves them room to register.

Three places the four stops could not be used literally, each checked rather
than eyeballed:

- **Text.** `#898989` reaches 3.5:1 on white — fine for a control border, which
  WCAG 1.4.11 puts at 3:1, and a failure for body copy at 4.5:1. So `--border`
  and `--input` are different tokens with different values, and muted text uses
  an interpolated `#6b6b6b`.
- **Light mode.** `#FF4D4D` is 3.3:1 on white and `#4DFFBC` is 1.28:1 —
  effectively invisible. Each mode therefore gets its own step of the same hue:
  darkened for the light surface, the palette values themselves on the dark
  one, where they were always going to look best. Dark mode is chosen, not
  inverted.
- **Charts.** The obvious move is red vs mint for the two series. It was
  rejected on evidence: the palette validator scores that pair ΔE 7.6 for
  deuteranopia — inside the marginal 6–8 band — where the existing blue/orange
  scores 24.7. And red and mint already mean "breached" and "met" here, so a
  red line would read as bad news rather than as a series. Both series colours
  pass all six checks against their own surface.

A three-state SLA also needs a colour the palette does not carry, so amber is
retained for the 75% warning; red and mint would otherwise have nothing between
them.

---

## Reports are SQL, not application code

`src/lib/reports.ts` uses `$queryRaw` with `generate_series` and
`FILTER (WHERE …)`. Loading tickets to average them in JavaScript would work
today and stop working at a scale a support desk reaches quickly.

Charts follow the categorical palette rules: two validated series colours,
stepped separately for light and dark rather than flipped, and identity is
never carried by colour alone — there's always a legend and an optional table.

---

## Testing: three layers, each for what it's good at

- **Unit** (55) — pure logic: business hours, inbound parsing, quoted-reply
  stripping, the AI transcript and escalation rules.
- **Verification scripts** (`npm run verify`) — properties that need a real
  database: tenant isolation, SLA transitions, routing fairness, AI
  degradation. Each provisions a throwaway workspace and deletes it.
- **End-to-end** (30 Playwright) — the flows a user actually performs, against
  a real build and real Postgres, plus the things that must *not* happen:
  cross-tenant reads, notes leaking to the portal, tampered portal tokens,
  guessed ticket numbers.

No mocked database anywhere. A mock would have happily passed every isolation
test while the real thing leaked.

---

## Known gaps

- **The live AI path is untested.** No API key was available in the build
  environment, so `verify:ai` has only been exercised on its no-key branch.
  The live branch is written and typechecked, not run.
- **The `.dmg` has not been built.** Packaging is verified on Linux for both
  the Electron shell and a fully packaged app — which is how two packaging bugs
  were caught — and `electron-builder --mac` gets as far as laying out
  `Deskly.app` for arm64 and x64 before failing: the dmg step needs `sips` and
  `hdiutil`, and signing needs `codesign`. All three are macOS-only, so there
  is no workaround on Linux. The `Deskly - Build macOS dmg` GitHub Actions
  workflow runs the same command on a macOS runner and uploads the artifact.
  It builds unsigned (ad-hoc signature only) until Apple Developer credentials
  are added as repository secrets.
- **Single-process assumptions**: the event bus and rate limiter are
  in-memory (see above).
- **No attachment upload UI.** Storage, the download route and the size and
  MIME allowlist exist; the upload control does not.
- **Sentry is configured by environment variable but not wired up.**
