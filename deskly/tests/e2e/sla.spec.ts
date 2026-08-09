import { test, expect, DEMO, unique, signIn } from "./fixtures";

/**
 * SLA behaviour in the browser.
 *
 * The arithmetic — business hours, DST, weekends — is proven by the unit tests
 * and by `npm run verify:sla`. What matters here is that the state reaches the
 * agent's eye: a chip that is present, labelled, and not colour-alone.
 */

test.describe("SLA indicators", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a new ticket shows an SLA due time", async ({ page }) => {
    const subject = `SLA check ${unique("t")}`;

    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Timer should start on this one.");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    // The chip carries text, not just a colour — colour-blind agents and
    // screenshots in a bug report both need the words.
    const chip = page.getByText(/first response due|resolution due|overdue|within sla|sla missed/i).first();
    await expect(chip).toBeVisible({ timeout: 15_000 });
  });

  test("an overdue ticket is labelled overdue, not just coloured red", async ({ page }) => {
    // The seed backdates tickets far enough that some have blown their SLA.
    await page.goto("/inbox?preset=overdue");

    // The queue loads client-side, so wait for a row rather than counting
    // straight away — an unwaited count() is always zero.
    const rows = page.locator('a[href^="/inbox/"]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    await rows.first().click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i);
    await expect(page.getByText(/overdue/i).first()).toBeVisible();
  });

  test("resolving stops the clock", async ({ page }) => {
    const subject = `Stop the clock ${unique("t")}`;

    await page.getByRole("button", { name: "New ticket" }).first().click();
    await page.fill('input[name="customerEmail"]', DEMO.customer.email);
    await page.fill('input[name="subject"]', subject);
    await page.fill('textarea[name="body"]', "Resolve me.");
    await page.getByRole("button", { name: /create/i }).click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

    await page.getByRole("button", { name: /^resolve$/i }).click();
    await expect(page.getByRole("button", { name: /^reopen$/i })).toBeVisible({ timeout: 15_000 });

    // A resolved ticket stops counting down: it reports an outcome, not a
    // deadline.
    await expect(page.getByText(/first response due|resolution due/i)).toHaveCount(0);
  });
});
