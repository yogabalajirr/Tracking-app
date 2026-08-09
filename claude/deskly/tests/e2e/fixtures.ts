import { test as base, expect, type Page } from "@playwright/test";

/**
 * Shared helpers for the e2e suite.
 *
 * Sign-in goes through the real form rather than a minted cookie: the login
 * path is itself something worth breaking loudly, and it costs one request.
 */

export const DEMO = {
  subdomain: "acme",
  owner: { email: "yogabalajirr@gmail.com", name: "yogabalaji" },
  admin: { email: "arjun@acme.test", name: "Arjun Mehta" },
  agent: { email: "sara@acme.test", name: "Sara Iyer" },
  password: "deskly123",
  customer: { email: "rahul@northwind.test", name: "Rahul Verma" },
};

export async function signIn(page: Page, email = DEMO.owner.email) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/inbox/);
}

/**
 * The ticket id out of an inbox URL.
 *
 * Not `url.split("/").pop()`: navigating from a filtered queue leaves the
 * `?q=` on the URL, and the query string would ride along into the id.
 */
export function ticketIdFromUrl(url: string): string {
  return new URL(url).pathname.split("/").filter(Boolean).pop()!;
}

/** A value nothing else in the database will collide with. */
export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Opens the ticket whose subject matches, from wherever we are.
 *
 * Goes through search rather than clicking the first row, so a test does not
 * silently pass against the wrong ticket when the queue reorders.
 */
export async function openTicketBySubject(page: Page, subject: string) {
  await page.goto(`/inbox?q=${encodeURIComponent(subject)}`);

  const row = page.locator(`a[href^="/inbox/"]`, { hasText: subject }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await page.waitForURL(/\/inbox\/[a-z0-9]+/i);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(subject);
}

export const test = base;
export { expect };
