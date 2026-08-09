# Changelog

All notable changes to Deskly. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-08-09

First release. Everything below arrived in this version; the dates mark when
each piece landed.

### Added

**Foundation** — 2026-08-07

- PostgreSQL schema for workspaces, users, teams, customers, tickets, messages,
  activities, attachments, tags, SLA policies, assignment rules, canned
  responses, saved views and notifications.
- Multi-tenant isolation enforced at the query layer: a Prisma client extension
  merges `workspaceId` into every `where` and every write. Cross-tenant
  `update`/`delete` fails before touching a row.
- Session-cookie auth, four roles (Owner, Admin, Agent, Viewer) behind a
  capability matrix, workspace provisioning and signed email invites.
- Ticket lifecycle — Open, Pending, On hold, Resolved, Closed — with an
  append-only activity log.

**Agent inbox** — 2026-08-07

- Unified queue with filters, saved views, bulk actions and full-text search.
- Ticket detail with threaded conversation, internal notes and `@mentions`.
- Canned responses with `{{variables}}`, inserted via a `/` command.
- Keyboard shortcuts (`j`/`k`, `r`, `n`, `e`, `a`, `#`, `⌘↵`) and a help sheet.
- Live updates over Server-Sent Events.
- Demo seed: 3 agents, 2 teams, 5 customers, 20 tickets across every status.

**Email channel** — 2026-08-07

- Inbound webhook accepting Postmark, SendGrid Inbound Parse and a
  provider-neutral JSON shape, authenticated by shared secret.
- Threading on `In-Reply-To`/`References` against a Message-ID that embeds the
  ticket id, so it survives a rewritten subject. `[#42]` in the subject is a
  fallback, honoured only from the ticket's own customer.
- Idempotent on Message-ID, because providers retry.
- Outbound adapters: console (writes `.eml` to `./storage/outbox`, the default
  so the app works offline), Resend, Postmark and SMTP.
- Quoted-reply stripping so threads don't accumulate the whole history.

**Customer portal and web form** — 2026-08-07

- Portal reachable with an HMAC-signed link and no account. Customers read the
  thread — internal notes excluded — and reply.
- Embeddable `widget.js` that renders in a shadow root, with no framework
  loaded onto the host page.
- Rate limiting and a honeypot field on both public endpoints.

**Automation and SLAs** — 2026-08-08

- Rule builder: 6 fields, 6 operators, 5 actions, up to 20 active rules,
  applied top-down with all matches rather than first-match.
- Load-balanced round-robin assignment — fewest active tickets, not positional.
- Per-priority SLA policies with business hours, holidays and timezone-correct
  arithmetic across DST.
- Background worker that warns at 75% and records a breach at 100%, exactly
  once, via in-app notification and email.
- Settings for workspace, members, teams, SLA policies, rules and macros.

**Reporting** — 2026-08-08

- Dashboard: ticket volume over time, first-response and resolution averages,
  SLA compliance, status/priority/channel breakdowns, per-agent stats, each
  compared against the previous window.
- Aggregates computed in SQL rather than in application code.
- CSV export for tickets (respecting the current inbox filters) and agents.
- Charts use a validated colour-blind-safe palette, stepped separately for
  light and dark, with identity never carried by colour alone.

**AI features, optional** — 2026-08-08

- Auto-triage on ticket creation: category and priority, written to
  `aiCategory` plus a tag and logged as an `AI_TAGGED` activity. May raise a
  priority, never lower one.
- Streamed reply drafts into the agent's composer. Nothing is ever sent to a
  customer by the model.
- Thread summaries, cached until the next message arrives.
- Every feature disappears cleanly when `ANTHROPIC_API_KEY` is unset — the
  Anthropic SDK is not even loaded.

**macOS desktop app** — 2026-08-09

- Electron shell running the Next standalone server and the SLA worker as
  child processes, with a native menu and a sandboxed renderer.
- `npm run setup:mac`: Homebrew, Node, PostgreSQL 16, database, generated
  `APP_SECRET`, migrations and seed, in one re-runnable command.
- `npm run dist:mac` packages a `.dmg` for arm64 and x64.

**Tests** — throughout

- 55 unit tests, 12 desktop-supervision tests, 30 Playwright end-to-end tests.
- Four verification scripts (`npm run verify`) that provision a throwaway
  workspace and prove tenant isolation, SLA transitions, routing fairness and
  AI degradation against a real database.

### Fixed

- **Honeypot leaked its own existence** — a trapped submission returned `200`
  while a genuine one returned `201`, letting a bot identify the hidden field
  by status code. Both are `201` now.
- **The dev `.env` was being copied into the macOS app bundle.** Next's file
  trace pulls it into `.next/standalone`, so the packaging config now excludes
  it explicitly — it contained `APP_SECRET` and database credentials.
- **The packaged app could not start**: `electron-builder` strips
  `node_modules` out of a directory copy, silently producing an incomplete
  bundle. It needs its own `extraResources` entry.
- **Twelve React state-in-effect violations.** Derived state is now computed
  during render, external state (theme, browser timezone) is read through
  `useSyncExternalStore`, and the per-instance timers in `RelativeTime` were
  collapsed into one shared clock.
- **GDPR export navigated the app away** instead of downloading; it is an
  anchor now, so the browser honours `Content-Disposition`.

### Security

- Tenant isolation enforced at the query layer, not per route, and proven by
  a script that attempts cross-workspace reads and writes.
- Cross-tenant access returns 404 rather than 403, so a probe cannot confirm
  that an id exists elsewhere.
- Email content sanitised before rendering.
- Attachments constrained by size limit and MIME allowlist.
- Public endpoints rate-limited; portal and invite links are HMAC-signed with
  expiry.
- All timestamps stored UTC, rendered in workspace time.
- GDPR/DPDP customer data export and deletion endpoints.
- No secrets in the repository; `.env` is gitignored and excluded from the app
  bundle.

### Known gaps

See the end of `DECISIONS.md`. In short: the live AI path has not been run
against a real API key, the `.dmg` has not been built on macOS, the event bus
and rate limiter assume a single process, there is no attachment upload UI, and
Sentry is configured but not wired up.
