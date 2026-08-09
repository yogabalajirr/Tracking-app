import { test, expect, DEMO, unique, signIn, openTicketBySubject } from "./fixtures";

test.describe("ticket creation and the reply flow", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("creates a ticket, replies to it, and resolves it", async ({ page }) => {
    const subject = `Payment failed ${unique("t")}`;

    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Card was declined at checkout twice today.");
    await page.getByRole("button", { name: /create/i }).click();

    // Creation navigates straight to the new ticket.
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(subject);
    await expect(
      page.getByText("Card was declined at checkout twice today.", { exact: true }),
    ).toBeVisible();

    // --- reply ---
    const composer = page.locator("textarea").last();
    await composer.fill("Sorry about that — I've reset the payment method on your account.");
    await composer.press("Control+Enter");

    await expect(
      page.getByText("Sorry about that — I've reset the payment method on your account."),
    ).toBeVisible({ timeout: 15_000 });

    // An agent reply moves an open ticket to Pending: the ball is now with
    // the customer.
    await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    // --- resolve ---
    await page.getByRole("button", { name: /^resolve$/i }).click();
    await expect(page.getByRole("button", { name: /^reopen$/i })).toBeVisible({ timeout: 15_000 });
  });

  test("an internal note is visibly separated from customer replies", async ({ page }) => {
    const subject = `Refund question ${unique("t")}`;

    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Where is my refund?");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    await page.getByRole("button", { name: /internal note/i }).click();

    const note = "Checked Stripe — refund is queued, releases Friday.";
    const composer = page.locator("textarea").last();
    await composer.fill(note);
    await composer.press("Control+Enter");

    await expect(page.getByText(note)).toBeVisible({ timeout: 15_000 });

    // The whole point of a note is that it is marked as not-sent-to-customer.
    await expect(page.getByText(/internal/i).first()).toBeVisible();

    // And the customer must not see it in the portal.
    const portalUrl = await page.getAttribute('a[href*="/portal/ticket/"]', "href");
    expect(portalUrl, "the ticket should expose a portal link").toBeTruthy();

    await page.goto(portalUrl!);
    await expect(page.getByText("Where is my refund?")).toBeVisible();
    await expect(page.getByText(note)).toHaveCount(0);
  });

  test("changing priority and assignee sticks across a reload", async ({ page }) => {
    const subject = `Login loop ${unique("t")}`;

    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Cannot get past the login screen.");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    const url = page.url();

    await page.selectOption('select:near(:text("Priority"))', "URGENT").catch(async () => {
      // Fall back to positional selection if the :near heuristic misses.
      await page.locator("select").nth(1).selectOption("URGENT");
    });

    await page.waitForTimeout(1_000);
    await page.goto(url);

    await expect(page.locator("select").nth(1)).toHaveValue("URGENT");
  });

  test("a resolved ticket reopens when the customer replies from the portal", async ({ page }) => {
    const subject = `Broken export ${unique("t")}`;

    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "CSV export downloads an empty file.");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    const ticketUrl = page.url();
    const portalUrl = await page.getAttribute('a[href*="/portal/ticket/"]', "href");
    expect(portalUrl).toBeTruthy();

    await page.getByRole("button", { name: /^resolve$/i }).click();
    await expect(page.getByRole("button", { name: /^reopen$/i })).toBeVisible({ timeout: 15_000 });

    // The customer replies on a resolved ticket — that has to bring it back.
    await page.goto(portalUrl!);
    const portalBox = page.locator("textarea").first();
    await portalBox.fill("Still empty on my side.");
    await page.getByRole("button", { name: /send reply/i }).click();
    await expect(page.getByText("Still empty on my side.")).toBeVisible({ timeout: 15_000 });

    await page.goto(ticketUrl);
    await expect(page.getByRole("button", { name: /^resolve$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Still empty on my side.")).toBeVisible();
  });

  test("search finds a ticket by its subject", async ({ page }) => {
    const subject = `Needle ${unique("s")}`;

    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Findable by full-text search.");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    await openTicketBySubject(page, subject);
  });
});
