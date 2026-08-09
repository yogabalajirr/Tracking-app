/**
 * Records a narrated walkthrough of TicketFlow as a video file.
 *
 *   npm run demo:video
 *
 * Drives a real browser against a running instance — nothing is staged or
 * faked — and overlays a caption on each step so the recording explains itself
 * without a voice track. Output lands in ./recordings.
 *
 * Run `npm run seed` first so the queue looks like the demo dataset rather than
 * whatever your last test run left behind.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, "recordings");

const BASE = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000";
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL ?? "yogabalajirr@gmail.com";
const OWNER_NAME = process.env.DEMO_OWNER_NAME ?? "yogabalaji";
const SIZE = { width: 1440, height: 900 };

/**
 * Captions are the only thing this script adds to the picture. Set
 * DEMO_CAPTIONS=off for a raw screen recording with no overlay — same
 * walkthrough, same timing, nothing drawn on top.
 */
const CAPTIONS = process.env.DEMO_CAPTIONS !== "off";

/** Slow enough to read, fast enough to watch. */
const BEAT = 900;
const READ = 2200;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
});

const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: SIZE },
  colorScheme: "light",
});

const page = await context.newPage();

/** Set in the finally block, read after the context closes. */
let video = null;

/**
 * The caption bar.
 *
 * Injected per navigation rather than once, because a full page load wipes it.
 * It lives in its own fixed layer with pointer-events off, so it never changes
 * how the app below it behaves.
 */
async function caption(title, detail = "") {
  await page.evaluate(() => window.scrollTo(0, 0));
  if (!CAPTIONS) return;
  await page.evaluate(
    ([t, d]) => {
      let bar = document.getElementById("__demo_caption");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "__demo_caption";
        Object.assign(bar.style, {
          position: "fixed",
          left: "50%",
          bottom: "22px",
          transform: "translateX(-50%)",
          maxWidth: "88vw",
          zIndex: "2147483647",
          pointerEvents: "none",
          padding: "11px 20px",
          borderRadius: "999px",
          whiteSpace: "nowrap",
          background: "rgba(15,17,26,.92)",
          boxShadow: "0 8px 30px rgba(0,0,0,.28)",
          color: "#fff",
          font: '500 15px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          letterSpacing: ".01em",
          transition: "opacity .25s ease",
        });
        document.body.appendChild(bar);
      }
      if (!t && !d) {
        bar.style.opacity = "0";
        return;
      }
      bar.innerHTML =
        `<span style="font-weight:650">${t}</span>` +
        (d ? `<span style="opacity:.72;margin-left:10px">${d}</span>` : "");
      bar.style.opacity = "1";
    },
    [title, detail],
  );
}

/**
 * Scroll the pane that actually scrolls.
 *
 * The app is a fixed-height shell with its own internal scroll containers, so
 * scrolling the window does nothing useful and, once the composer grows the
 * document, actively breaks the layout on camera.
 */
async function scrollPane(top) {
  await page.evaluate((y) => {
    const [best] = [...document.querySelectorAll("*")]
      .map((el) => ({ el, slack: el.scrollHeight - el.clientHeight }))
      .filter(({ el, slack }) => slack > 40 && el.clientHeight > 300)
      .sort((a, b) => b.slack - a.slack);
    (best?.el ?? document.scrollingElement).scrollTo({ top: y, behavior: "smooth" });
  }, top);
  await new Promise((r) => setTimeout(r, 700));
}

/** Step through the story: caption, let it land, then act. */
async function step(title, detail, action, { read = READ } = {}) {
  await caption(title, detail);
  await pause(read);
  if (action) await action();
  await pause(BEAT);
}

async function goto(url, title, detail) {
  await page.goto(url, { waitUntil: "networkidle" });
  await caption(title, detail);
  await pause(READ);
}

try {
  // --- 1. Sign in ------------------------------------------------------
  await goto(`${BASE}/login`, "TicketFlow", "Customer support ticketing for a small team");

  await page.fill('input[name="email"]', OWNER_EMAIL);
  await pause(400);
  await page.fill('input[name="password"]', "ticketflow123");
  await step("Sign in", `${OWNER_NAME} — the workspace owner`, async () => {
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/inbox/);
    await page.waitForLoadState("networkidle");
  });

  // --- 2. The queue ----------------------------------------------------
  await caption("The unified inbox", "Every channel lands in one queue, sorted by urgency");
  await pause(READ + 600);

  await step(
    "SLA at a glance",
    "Green, amber at 75% of target, red once breached — never colour alone",
    null,
    { read: READ + 1200 },
  );

  await step("Saved views and filters", "Presets across the top, saved views beside them", async () => {
    await page.goto(`${BASE}/inbox?preset=overdue`, { waitUntil: "networkidle" });
    await caption("Saved views and filters", "Overdue: everything past its SLA deadline");
  });
  await pause(READ);

  // --- 3. Email arrives -------------------------------------------------
  await goto(`${BASE}/inbox`, "A customer emails support@", "Watch the queue — no refresh");

  const subject = "Invoice 2291 charged twice";
  await page.evaluate(
    async ([base, secret, domain, subj]) => {
      await fetch(`${base}/api/inbound/email?secret=${secret}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: `support@agent.${domain}`,
          from: '"Rahul Verma" <rahul@northwind.test>',
          subject: subj,
          text: "Hi team — we were billed twice for invoice 2291 on 3 October. The second charge has cleared and finance needs it reversed before month end.",
          messageId: `<demo-${Date.now()}@northwind.test>`,
        }),
      });
    },
    [BASE, process.env.INBOUND_WEBHOOK_SECRET ?? "dev-inbound-secret", process.env.EMAIL_DOMAIN ?? "ticketflow.local", subject],
  );

  await page.waitForSelector(`text=${subject}`, { timeout: 20_000 });
  await caption("It appears live", "Server-Sent Events — the queue updates itself");
  await pause(READ);

  // --- 4. Routing --------------------------------------------------------
  await step("Routing already ran", "A rule matched “invoice” before an agent saw it", async () => {
    await page.locator(`a[href^="/inbox/"]`, { hasText: subject }).first().click();
    await page.waitForURL(/\/inbox\/[a-z0-9]+/i);
    await page.waitForLoadState("networkidle");
  });

  const ticketUrl = page.url();

  await caption("Assigned, tagged, and logged", "Billing team, billing tag, and why — in the activity log");
  await pause(READ + 800);

  // --- 5. Reply with a canned response -----------------------------------
  const composer = page.locator("textarea").last();
  await step("Reply to the customer", "Canned responses insert with a “/” command", async () => {
    await composer.click();
    await composer.type("/", { delay: 120 });
  });
  await pause(1000);

  await step("", "", async () => {
    await composer.fill("");
    await composer.type(
      `Hi Rahul, thanks for flagging this — I can see the duplicate charge on invoice 2291 and I've started the reversal with our payments team. You'll see it back on the original card within 3 working days.\n\n${OWNER_NAME}`,
      { delay: 12 },
    );
  }, { read: 300 });

  await caption("Send", "⌘↵ — and the ticket moves to Pending automatically");
  await pause(1400);
  await composer.press("Control+Enter");
  await page.waitForLoadState("networkidle");
  await pause(READ);

  // --- 6. Internal note --------------------------------------------------
  await step("Internal notes stay internal", "@mention a teammate — the customer never sees it", async () => {
    await page.getByRole("button", { name: /internal note/i }).click();
    const note = page.locator("textarea").last();
    await note.click();
    await note.type("@sara@agentsupport.test can you confirm the reversal cleared on Friday?", { delay: 16 });
  });
  await pause(900);
  await page.locator("textarea").last().press("Control+Enter");
  await page.waitForLoadState("networkidle");
  await pause(READ);

  // --- 7. Customer portal -------------------------------------------------
  const portalUrl = await page.getAttribute('a[href*="/portal/ticket/"]', "href");

  await caption("The customer's view", "A signed link — no account, no password");
  await pause(READ);

  // Navigate the same tab rather than opening a second one: Playwright records
  // one video per page, so a new tab would split the walkthrough in two.
  await page.goto(portalUrl, { waitUntil: "networkidle" });
  await caption("Customer portal", "The reply is here — the internal note is not");
  await pause(READ + 1600);

  await page.goto(ticketUrl, { waitUntil: "networkidle" });
  await caption("Back in the agent view", "Resolve it — and the SLA clock stops");
  await pause(READ - 400);
  await page.getByRole("button", { name: /^resolve$/i }).click();
  await page.waitForLoadState("networkidle");
  await pause(READ);

  // --- 8. Reports ---------------------------------------------------------
  await goto(`${BASE}/reports`, "Reporting", "Volume, response times and SLA compliance");
  await page.waitForSelector("svg.recharts-surface", { timeout: 20_000 });
  await pause(READ);

  await step("Every number against the previous window", "So you can see the trend, not just the total", () =>
    scrollPane(560),
  );
  await pause(READ);

  await step("Per-agent breakdown", "Exportable to CSV, respecting the current filters", () =>
    scrollPane(1200),
  );
  await pause(READ);

  // --- 9. Dark mode --------------------------------------------------------
  // Land on the ticket rather than an empty queue: this is the closing shot,
  // and it should show the product doing something.
  await goto(`${ticketUrl}`, "Dark mode", "Chosen steps, not an inverted palette");
  await page
    .locator('[role="radiogroup"][aria-label="Colour theme"] button[aria-label="Dark"]')
    .click();
  await pause(READ + 1100);

  await caption("TicketFlow", "Next.js 16 · React 19 · PostgreSQL · Prisma · Electron for macOS");
  await pause(3000);
} finally {
  /*
   * Order matters. Closing the context finalises the file, but saveAs() still
   * talks to the browser — so the browser is closed after the save, not here.
   */
  video = page.video();
  await context.close();
}

/*
 * Playwright names the file after the page's GUID, so give it a real one.
 * Asking the video object where it went beats picking the newest .webm in the
 * directory — that heuristic happily renames a previous take.
 */
const target = path.join(
  OUT,
  CAPTIONS ? "ticketflow-walkthrough.webm" : "ticketflow-walkthrough-raw.webm",
);

if (!video) {
  await browser.close();
  console.error("No video was captured.");
  process.exit(1);
}

await video.saveAs(target);
await video.delete();
await browser.close();

console.log(`\nRecorded ${target}`);
