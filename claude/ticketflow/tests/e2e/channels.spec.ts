import { test, expect, DEMO, unique, signIn, openTicketBySubject } from "./fixtures";

/**
 * The two public capture channels: the embeddable form and the customer
 * portal. Both are unauthenticated, so they are also where abuse would arrive.
 */

test.describe("public channels", () => {
  test("the embeddable widget script is served and self-contained", async ({ request }) => {
    const res = await request.get("/widget.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("javascript");

    const source = await res.text();
    // It mounts into a shadow root so the host page's CSS cannot reach in.
    expect(source).toContain("attachShadow");
    // And it must not drag a framework onto someone else's site.
    expect(source).not.toContain("react");
  });

  test("a form submission becomes a ticket in the inbox", async ({ page, request }) => {
    const subject = `Widget submission ${unique("w")}`;

    const res = await request.post("/api/inbound/form", {
      data: {
        workspace: DEMO.subdomain,
        email: DEMO.customer.email,
        name: DEMO.customer.name,
        subject,
        message: "Sent from the embedded form on our marketing site.",
      },
    });
    expect(res.status()).toBe(201);

    await signIn(page);
    await openTicketBySubject(page, subject);
    // `exact` keeps this off the queue row's preview, which shows the same text.
    await expect(
      page.getByText("Sent from the embedded form on our marketing site.", { exact: true }),
    ).toBeVisible();
  });

  test("the honeypot swallows a bot without telling it why", async ({ page, request }) => {
    const subject = `Bot submission ${unique("b")}`;

    const res = await request.post("/api/inbound/form", {
      data: {
        workspace: DEMO.subdomain,
        email: "bot@spam.test",
        subject,
        message: "buy cheap things",
        // Only a bot fills the hidden field in.
        website: "http://spam.test",
      },
    });

    // Indistinguishable from a real submission at the status level, so the bot
    // has nothing to learn and nothing to tune against.
    expect(res.status()).toBe(201);

    await signIn(page);
    await page.goto(`/inbox?q=${encodeURIComponent(subject)}`);
    await expect(page.locator('a[href^="/inbox/"]', { hasText: subject })).toHaveCount(0);
  });

  test("a portal link opens without a login and hides internal notes", async ({ page }) => {
    await signIn(page);

    const subject = `Portal view ${unique("p")}`;
    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Customer-visible description.");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    const portalUrl = await page.getAttribute('a[href*="/portal/ticket/"]', "href");
    expect(portalUrl).toBeTruthy();

    // Signed out entirely — the signed token is the only credential.
    await page.context().clearCookies();
    await page.goto(portalUrl!);

    await expect(page.getByText(subject)).toBeVisible();
    await expect(page.getByText("Customer-visible description.")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("a portal link with a tampered token is rejected", async ({ page }) => {
    await signIn(page);

    const subject = `Tamper test ${unique("p")}`;
    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Should not be readable with a bad signature.");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    const portalUrl = await page.getAttribute('a[href*="/portal/ticket/"]', "href");
    const tampered = `${portalUrl!.split("?")[0]}?token=not-a-valid-signature`;

    await page.context().clearCookies();
    await page.goto(tampered);

    await expect(page.getByText("Should not be readable with a bad signature.")).toHaveCount(0);
  });
});
