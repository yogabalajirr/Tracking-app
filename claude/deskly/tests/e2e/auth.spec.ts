import { test, expect, DEMO, unique, signIn } from "./fixtures";

test.describe("authentication and signup", () => {
  test("rejects a wrong password without saying which field was wrong", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', DEMO.owner.email);
    await page.fill('input[name="password"]', "not-the-password");
    await page.click('button[type="submit"]');

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();

    // Telling an attacker which half was right is how you enumerate accounts.
    const message = (await alert.textContent())?.toLowerCase() ?? "";
    expect(message).not.toContain("no account");
    expect(message).not.toContain("user not found");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in and lands on the inbox", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/inbox/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("signing up creates a workspace and signs the owner straight in", async ({ page }) => {
    const slug = unique("acme");

    await page.goto("/signup");
    await page.fill('input[name="name"]', "Test Owner");
    await page.fill('input[name="email"]', `owner-${slug}@example.test`);
    await page.fill('input[name="password"]', "a-good-password");
    await page.fill('input[name="workspaceName"]', `Workspace ${slug}`);

    // The subdomain is derived from the workspace name; make it collision-proof.
    await page.fill('input[name="subdomain"]', slug);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/inbox/, { timeout: 30_000 });

    // A brand new workspace has no tickets — that empty state is the proof it
    // is a *new* workspace and not the demo one.
    await expect(page.getByText(/new tickets from email/i)).toBeVisible();
  });

  test("protected pages redirect to login when signed out", async ({ page }) => {
    await page.context().clearCookies();

    for (const path of ["/inbox", "/reports", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
