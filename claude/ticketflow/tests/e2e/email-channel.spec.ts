import {
  test,
  expect,
  DEMO,
  unique,
  signIn,
  openTicketBySubject,
  ticketIdFromUrl,
} from "./fixtures";

/**
 * The email channel, driven through the inbound webhook exactly as a provider
 * would drive it. The console email driver writes outbound mail to
 * ./storage/outbox, so no network and no credentials are involved.
 */

const SECRET = process.env.INBOUND_WEBHOOK_SECRET ?? "dev-inbound-secret";
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN ?? "ticketflow.local";

/**
 * The provider-neutral payload shape (the same one `npm run simulate:email`
 * sends). Postmark and SendGrid shapes are covered by the unit tests; this
 * suite is about what happens *after* parsing.
 */
function inboundPayload(over: Record<string, unknown> = {}) {
  return {
    to: `support@${DEMO.subdomain}.${EMAIL_DOMAIN}`,
    from: `"${DEMO.customer.name}" <${DEMO.customer.email}>`,
    subject: `Email ticket ${unique("e")}`,
    text: "Sent by email, should become a ticket.",
    messageId: `<${unique("msg")}@northwind.test>`,
    ...over,
  };
}

/**
 * Rebuild the Message-ID the app would have put on its own outbound reply.
 * Threading recovers the ticket id from it, so any value in this shape works —
 * which is the point: threading must not depend on the subject surviving.
 */
function ourMessageId(ticketId: string): string {
  return `<${unique("out")}.${ticketId}@${EMAIL_DOMAIN}>`;
}

test.describe("inbound email", () => {
  test("rejects a webhook call with no secret", async ({ request }) => {
    const res = await request.post("/api/inbound/email", { data: inboundPayload() });
    expect([401, 403]).toContain(res.status());
  });

  test("rejects mail addressed to an unknown workspace", async ({ request }) => {
    const res = await request.post(`/api/inbound/email?secret=${SECRET}`, {
      data: inboundPayload({ to: `support@nobody-here.${EMAIL_DOMAIN}` }),
    });
    expect(res.status()).toBe(404);
  });

  test("an inbound email becomes a ticket", async ({ page, request }) => {
    const payload = inboundPayload();

    const res = await request.post(`/api/inbound/email?secret=${SECRET}`, { data: payload });
    expect(res.ok(), await res.text()).toBeTruthy();

    await signIn(page);
    await openTicketBySubject(page, payload.subject);
    await expect(
      page.getByText("Sent by email, should become a ticket.", { exact: true }),
    ).toBeVisible();
  });

  test("the same Message-ID twice does not create two tickets", async ({ page, request }) => {
    const payload = inboundPayload();

    const first = await request.post(`/api/inbound/email?secret=${SECRET}`, { data: payload });
    expect(first.ok(), await first.text()).toBeTruthy();

    // Providers retry. A retry must be a no-op, not a duplicate ticket.
    const second = await request.post(`/api/inbound/email?secret=${SECRET}`, { data: payload });
    expect(second.ok()).toBeTruthy();

    await signIn(page);
    await page.goto(`/inbox?q=${encodeURIComponent(payload.subject)}`);

    const rows = page.locator('a[href^="/inbox/"]', { hasText: payload.subject });
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await expect(rows).toHaveCount(1);
  });

  test("a reply threads on headers, even when the subject is rewritten", async ({
    page,
    request,
  }) => {
    const opening = inboundPayload();
    const created = await request.post(`/api/inbound/email?secret=${SECRET}`, { data: opening });
    expect(created.ok(), await created.text()).toBeTruthy();

    await signIn(page);
    await openTicketBySubject(page, opening.subject);

    const ticketUrl = page.url();
    const ticketId = ticketIdFromUrl(ticketUrl);

    // A real mail client mangles the subject, so threading has to survive on
    // In-Reply-To alone.
    const reply = await request.post(`/api/inbound/email?secret=${SECRET}`, {
      data: inboundPayload({
        subject: "Re: something the customer retyped entirely",
        text: "That worked, thank you!",
        inReplyTo: ourMessageId(ticketId),
      }),
    });
    expect(reply.ok(), await reply.text()).toBeTruthy();

    await page.goto(ticketUrl);
    await expect(page.getByText("That worked, thank you!", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a customer reply reopens a resolved ticket", async ({ page, request }) => {
    const opening = inboundPayload();
    expect(
      (await request.post(`/api/inbound/email?secret=${SECRET}`, { data: opening })).ok(),
    ).toBeTruthy();

    await signIn(page);
    await openTicketBySubject(page, opening.subject);
    const ticketUrl = page.url();
    const ticketId = ticketIdFromUrl(ticketUrl);

    await page.getByRole("button", { name: /^resolve$/i }).click();
    await expect(page.getByRole("button", { name: /^reopen$/i })).toBeVisible({ timeout: 15_000 });

    await request.post(`/api/inbound/email?secret=${SECRET}`, {
      data: inboundPayload({
        subject: `Re: ${opening.subject}`,
        text: "Actually it is still broken.",
        inReplyTo: ourMessageId(ticketId),
      }),
    });

    /*
     * Reload until the reopen lands rather than trusting a single snapshot.
     * The webhook returns as soon as the message is stored, and the ticket
     * update that follows can commit after the navigation has already
     * rendered — a race that made this the one flaky test in the suite. Both
     * assertions still have to hold, so a ticket that never reopens still
     * fails.
     */
    await expect(async () => {
      await page.goto(ticketUrl);
      await expect(page.getByRole("button", { name: /^resolve$/i })).toBeVisible({ timeout: 3_000 });
      await expect(page.getByText("Actually it is still broken.", { exact: true })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 30_000 });
  });

  test("a stranger cannot inject into a ticket by guessing its number", async ({
    page,
    request,
  }) => {
    const opening = inboundPayload();
    expect(
      (await request.post(`/api/inbound/email?secret=${SECRET}`, { data: opening })).ok(),
    ).toBeTruthy();

    await signIn(page);
    await openTicketBySubject(page, opening.subject);
    const ticketUrl = page.url();

    const header = await page.locator("h1").locator("..").textContent();
    const number = header?.match(/#(\d+)/)?.[1];
    expect(number, "the ticket header should show its number").toBeTruthy();

    // The `[#N]` subject marker is the last-resort threading hint, and it is
    // only trusted from the ticket's own customer — otherwise "#42" would be a
    // guessable key into someone else's conversation.
    const intruder = await request.post(`/api/inbound/email?secret=${SECRET}`, {
      data: inboundPayload({
        from: `intruder-${unique("x")}@elsewhere.test`,
        subject: `Re: [#${number}] let me in`,
        text: "Injected by a stranger.",
      }),
    });
    expect(intruder.ok()).toBeTruthy();

    await page.goto(ticketUrl);
    await expect(page.getByText("Injected by a stranger.")).toHaveCount(0);
  });
});
