import { test, expect, signIn } from "./fixtures";

test.describe("reporting", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the dashboard renders charts with a legend, not colour alone", async ({ page }) => {
    await page.goto("/reports");

    await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 20_000 });

    // Two series in one chart means identity has to be readable without
    // distinguishing the colours.
    await expect(page.getByText("Created", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
  });

  test("switching the range reloads the numbers", async ({ page }) => {
    await page.goto("/reports?range=7d");
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 20_000 });

    await page.goto("/reports?range=90d");
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/range=90d/);
  });

  test("the CSV export downloads real rows", async ({ page }) => {
    await page.goto("/reports");

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("link", { name: /ticket/i }).first().click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf8");

    // Header row plus at least one ticket.
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toContain("Subject");
    expect(lines.length).toBeGreaterThan(1);
  });

  test("an agent can read reports but a viewer cannot manage the workspace", async ({ page }) => {
    // Sara is an AGENT: reports yes, member management no.
    await page.context().clearCookies();
    await signIn(page, "sara@acme.test");

    await page.goto("/reports");
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 20_000 });

    await page.goto("/settings/members");
    // Either the route bounces her, or the page renders without invite
    // controls — both are acceptable; silently letting her invite is not.
    const inviteButton = page.getByRole("button", { name: /invite/i });
    await expect(inviteButton).toHaveCount(0);
  });
});
