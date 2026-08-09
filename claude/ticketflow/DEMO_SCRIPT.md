# Demo script

Ten steps, about five minutes. Run `npm run setup:mac && npm run dev`, plus
`npm run worker` in a second terminal, then sign in as **yogabalajirr@gmail.com** /
**ticketflow123**.

1. **The queue.** Open `/inbox`. Twenty tickets across every status, each with
   an SLA chip — green, amber at 75%, red past the deadline. `j`/`k` walks the
   queue and opens each ticket as it goes; `/` jumps to search; `?` lists every
   shortcut.
2. **Email in.** Run
   `npm run simulate:email -- --to support@agent.ticketflow.local --from rahul@northwind.test --subject "Invoice 2291 charged twice"`.
   The ticket appears in the queue without a refresh.
3. **Routing.** Open it. The seeded rule matched "invoice", so it is already
   on the Billing team with an owner and a `billing` tag, and the activity log
   shows `RULE_APPLIED` next to `ASSIGNED`.
4. **Reply.** Press `r`, type `/`, pick a canned response, watch `{{variables}}`
   fill in, and send with `⌘↵`. The ticket moves to Pending; the outbound mail
   is in `./storage/outbox`.
5. **Internal note.** Press `n`, type `@sara@agentsupport.test` and post. It renders
   distinctly and Sara gets a notification — customers never see it.
6. **Customer portal.** Copy the portal link from the sidebar, open it in a
   private window. No login. The internal note is absent.
7. **Reopen.** Resolve the ticket, then reply from the portal. It reopens, and
   the SLA clock restarts.
8. **Triage by Claude** *(needs `ANTHROPIC_API_KEY`)*. Click the sparkle beside
   "AI category" to classify, and "Suggest reply" to stream a draft into the
   composer for editing. Without a key these controls simply aren't there.
9. **Reports.** Open `/reports`: volume, response and resolution times, SLA
   compliance and per-agent stats, each against the previous window. Export
   CSV.
10. **Proof.** Run `npm run verify` — four scripts spin up throwaway workspaces
    and prove tenant isolation, SLA transitions, routing fairness and clean AI
    degradation, then delete them.
