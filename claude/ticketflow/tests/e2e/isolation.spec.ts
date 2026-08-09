import { test, expect, DEMO, unique, signIn, ticketIdFromUrl } from "./fixtures";

/**
 * Multi-tenant isolation, from the outside.
 *
 * `npm run verify:isolation` proves the query layer; this proves the same thing
 * through HTTP, which is where a leak would actually hurt. A ticket id from one
 * workspace must be a 404 in another — not a 403, which would confirm the id
 * exists.
 */

test("a ticket id from another workspace is not reachable", async ({ page, request }) => {
  // --- workspace A: the demo workspace ---
  await signIn(page);

  const subject = `Tenant secret ${unique("t")}`;
  await page.getByRole("button", { name: "New ticket" }).first().click();
  await page.fill('input[name="customerEmail"]', DEMO.customer.email);
  await page.fill('input[name="subject"]', subject);
  await page.fill('textarea[name="body"]', "Only workspace A may see this.");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/inbox\/[a-z0-9]+/i, { timeout: 20_000 });

  const ticketId = ticketIdFromUrl(page.url());
  expect(ticketId).toBeTruthy();

  // --- workspace B: a brand new one, in a clean browser context ---
  const slug = unique("other");
  await page.context().clearCookies();

  await page.goto("/signup");
  await page.fill('input[name="name"]', "Other Owner");
  await page.fill('input[name="email"]', `other-${slug}@example.test`);
  await page.fill('input[name="password"]', "a-good-password");
  await page.fill('input[name="workspaceName"]', `Other ${slug}`);
  await page.fill('input[name="subdomain"]', slug);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/inbox/, { timeout: 30_000 });

  // The page must not render the other workspace's ticket…
  await page.goto(`/inbox/${ticketId}`);
  await expect(page.getByText(subject)).toHaveCount(0);
  await expect(page.getByText("Only workspace A may see this.")).toHaveCount(0);

  // …and the API must say "not found", never "forbidden": a 403 would confirm
  // the id is real.
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const res = await request.get(`/api/tickets/${ticketId}`, {
    headers: { Cookie: cookieHeader },
  });
  expect(res.status()).toBe(404);

  const patched = await request.patch(`/api/tickets/${ticketId}`, {
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    data: { status: "CLOSED" },
  });
  expect(patched.status()).toBe(404);

  // And the write really did not land: back in workspace A it is untouched.
  await page.context().clearCookies();
  await signIn(page);
  await page.goto(`/inbox/${ticketId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(subject);
  await expect(page.getByRole("button", { name: /^resolve$/i })).toBeVisible();
});

test("signed-out callers get no ticket data at all", async ({ request }) => {
  const res = await request.get("/api/tickets");
  expect([401, 403]).toContain(res.status());

  const body = await res.text();
  expect(body).not.toContain("subject");
});
