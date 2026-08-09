# Deskly

Customer support ticketing that a small team can run on day one. Email, a web
form and a customer portal all land in one queue, with SLA timers, routing
rules and reporting behind them.

Runs as a web app or as a native macOS app.

---

## Quick start (macOS)

```bash
npm run setup:mac
npm run dev          # http://localhost:3000
```

`setup:mac` installs Homebrew, Node and PostgreSQL 16 if they're missing,
creates the database, writes a `.env` with a generated `APP_SECRET`, applies
the migrations and seeds a demo workspace. It is safe to run twice — every
step checks before it acts, and an existing `.env` is left alone.

Sign in as **priya@acme.test** / **deskly123**.

For the desktop app:

```bash
npm run desktop      # build + launch
npm run dist:mac     # dist/Deskly-<version>-{arm64,x64}.dmg
```

### Other platforms

Everything except the `.dmg` works anywhere Node 20+ and PostgreSQL 16 run:

```bash
cp .env.example .env          # then set DATABASE_URL and APP_SECRET
npm install
npm run db:deploy
npm run seed
npm run dev
```

Generate a secret with `openssl rand -hex 32`.

---

## What's in it

| | |
|---|---|
| **Capture** | Email-to-ticket, an embeddable web form, manual creation |
| **Inbox** | Filters, saved views, bulk actions, full-text search, live updates |
| **Lifecycle** | Open → Pending → Resolved → Closed, plus On hold; immutable activity log |
| **Routing** | Rule builder and load-balanced round-robin assignment |
| **SLAs** | Per-priority targets, business hours, warning at 75%, email + in-app alerts |
| **Portal** | Customers track and reply with a signed link — no account |
| **Collaboration** | Internal notes with `@mentions`, canned responses with `/` and `{{variables}}` |
| **Reporting** | Volume, response and resolution times, per-agent stats, CSV export |
| **Admin** | Workspaces, teams, four roles, email invites |
| **AI (optional)** | Auto-triage, streamed reply drafts, thread summaries |

Turning off the AI key removes the AI features and changes nothing else.

---

## Running it

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run worker` | SLA timers and housekeeping — run alongside `dev` |
| `npm run build` / `npm start` | Production build and server |
| `npm run desktop` | Build and launch the macOS app |
| `npm run dist:mac` | Package a `.dmg` for arm64 and x64 |
| `npm run seed` | Reseed the demo workspace |
| `npm run simulate:email` | Post a fake inbound email at the webhook |
| `npm run dev:session` | Mint a session cookie for curl |

The desktop app starts its own worker. `npm run dev` does not — run
`npm run worker` in a second terminal if you want SLA alerts to fire.

### Tests

| Command | What it covers |
|---|---|
| `npm test` | Types, 55 unit tests, 12 desktop-supervision tests |
| `npm run test:e2e` | 30 Playwright tests against a real build |
| `npm run verify` | Isolation, SLA, routing and AI proofs against a live database |

`npm run verify` is worth knowing about: each script provisions a throwaway
workspace, asserts a property that would be expensive to get wrong, and deletes
it. `verify:isolation` in particular tries to read and write across workspaces
and proves it cannot.

---

## Email

The default `EMAIL_PROVIDER=console` writes outbound mail to
`./storage/outbox/*.eml`, so the whole email loop works offline. Set
`EMAIL_PROVIDER` to `resend`, `postmark` or `smtp` for real delivery.

Inbound mail arrives at `POST /api/inbound/email`, authenticated with
`INBOUND_WEBHOOK_SECRET` (as `?secret=` or the `X-Deskly-Secret` header).
Postmark, SendGrid Inbound Parse and a provider-neutral JSON shape are all
accepted. Point your provider's inbound webhook at that URL.

Each workspace gets an address of the form `support@<subdomain>.<EMAIL_DOMAIN>`.
Plus-addressing (`support+<subdomain>@<EMAIL_DOMAIN>`) also works, which is
what most people can set up without a wildcard MX record.

To try it without any of that:

```bash
npm run simulate:email -- --to support@acme.deskly.local \
                          --from rahul@northwind.test \
                          --subject "Printer is on fire"
```

Replies thread on `In-Reply-To`/`References` against a Message-ID that embeds
the ticket id, so threading survives a customer rewriting the subject line.

---

## Embedding the form

```html
<script src="https://your-deskly-host/widget.js"
        data-workspace="acme"
        data-color="#4f46e5"
        data-label="Support"></script>
```

It renders inside a shadow root, so the host page's CSS cannot reach in and its
own styles cannot leak out. No framework is loaded onto the host page.

---

## Configuration

Everything lives in `.env` — see `.env.example` for the annotated list. The
ones without defaults:

| Variable | |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_SECRET` | Signs session cookies and portal tokens. `openssl rand -hex 32` |
| `APP_URL` | Public base URL, used to build portal and invite links |
| `INBOUND_WEBHOOK_SECRET` | Shared secret for the inbound email webhook |

`NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_EMAIL_DOMAIN` must mirror `APP_URL` and
`EMAIL_DOMAIN`; they are inlined into the client bundle at build time.

Set `ANTHROPIC_API_KEY` to turn on the AI features. Leave it empty and they
disappear cleanly.

Never commit `.env`. It is gitignored, and the desktop packaging explicitly
excludes it from the app bundle.

---

## Architecture

Next.js 16 (App Router) · React 19 · PostgreSQL 16 · Prisma 7 · Tailwind 4 ·
Electron 43 for the desktop shell.

```
src/
  app/            routes — pages under (app)/(auth)/portal, REST under api/
  components/     UI, grouped by feature
  lib/            the domain: tickets, sla, rules, email, reports, ai
  generated/      Prisma client (generated, not committed)
electron/         desktop shell — main, preload, and the supervisor it uses
prisma/           schema, migrations, seed
scripts/          setup, packaging, verification, dev utilities
tests/            unit, electron, e2e
```

Two things are worth knowing before changing anything:

**Tenant isolation is enforced in one place.** `src/lib/db.ts` wraps Prisma in
a client extension that merges `workspaceId` into the `where` of every query
and into the `data` of every write. Route handlers get that scoped client from
`withAuth` and never see the raw one. `workspaceId` is denormalised onto every
tenant table specifically so this can work uniformly, without traversing
relations. A cross-tenant `update` or `delete` fails with `P2025` before it
touches a row — proved by `npm run verify:isolation`.

**SLA time is business time.** `src/lib/business-hours.ts` does the arithmetic
in the workspace's timezone across weekends, holidays and DST transitions. It
deliberately imports nothing server-only so it stays unit-testable.

`DECISIONS.md` explains the choices that aren't obvious from the code.

---

## Licence

MIT.
