/**
 * Rasterise build/icon.svg to build/icon.png at 1024×1024.
 *
 *   npm run icon
 *
 * electron-builder converts that PNG to the .icns the app bundle needs, so
 * this only has to run when the artwork changes — the PNG is committed.
 * Chromium does the rendering because it is already here for the e2e tests,
 * and it gets gradients and rounded joins right without another dependency.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SIZE = 1024;

const svg = await fs.readFile(path.join(root, "build", "icon.svg"), "utf8");

const browser = await chromium.launch({
  // Set PLAYWRIGHT_CHROMIUM_PATH when the bundled download is unavailable.
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
});

const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});

await page.setContent(
  `<!doctype html><style>
     html,body{margin:0;padding:0;background:transparent}
     svg{display:block;width:${SIZE}px;height:${SIZE}px}
   </style>${svg}`,
  { waitUntil: "load" },
);

await page.screenshot({
  path: path.join(root, "build", "icon.png"),
  omitBackground: true,
});

await browser.close();
console.log(`build/icon.png written at ${SIZE}×${SIZE}`);
