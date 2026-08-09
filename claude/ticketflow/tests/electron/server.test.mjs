import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findFreePort, waitForServer, resolveStandaloneRoot, startBackend } = require(
  "../../electron/server.js",
);

/**
 * The desktop shell's supervision logic, tested for real: it binds actual
 * ports, polls actual HTTP servers, and spawns an actual child process. The
 * window itself is Electron's problem; everything that can go wrong at launch
 * is here.
 */

// --- Port selection -------------------------------------------------------

test("hands back a port that can actually be bound", async () => {
  const port = await findFreePort();
  assert.ok(port > 0 && port < 65_536, `got ${port}`);

  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
});

test("prefers the port it is asked for", async () => {
  const wanted = await findFreePort();
  assert.equal(await findFreePort(wanted), wanted);
});

test("falls back when the preferred port is taken", async () => {
  const taken = await findFreePort();

  const blocker = net.createServer();
  await new Promise((r) => blocker.listen(taken, "127.0.0.1", r));

  try {
    const port = await findFreePort(taken);
    assert.notEqual(port, taken, "should not have handed back the busy port");
    assert.ok(port > 0);
  } finally {
    await new Promise((r) => blocker.close(r));
  }
});

// --- Health polling -------------------------------------------------------

test("waits for a server that starts late", async () => {
  const port = await findFreePort();
  const server = http.createServer((_req, res) => res.end("ok"));

  // Start listening only after polling has already begun.
  setTimeout(() => server.listen(port, "127.0.0.1"), 400);

  try {
    assert.equal(await waitForServer(`http://127.0.0.1:${port}/`, { timeoutMs: 5_000 }), true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("treats a redirect as alive — /login redirects when signed in", async () => {
  const port = await findFreePort();
  const server = http.createServer((_req, res) => {
    res.writeHead(307, { Location: "/inbox" });
    res.end();
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));

  try {
    assert.equal(await waitForServer(`http://127.0.0.1:${port}/login`, { timeoutMs: 3_000 }), true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("gives up instead of hanging when nothing ever listens", async () => {
  const port = await findFreePort();
  const started = Date.now();

  const ok = await waitForServer(`http://127.0.0.1:${port}/`, {
    timeoutMs: 600,
    intervalMs: 100,
  });

  assert.equal(ok, false);
  assert.ok(Date.now() - started < 5_000, "should have returned promptly");
});

// --- Build discovery ------------------------------------------------------

test("finds the standalone build in a packaged layout", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticketflow-packaged-"));
  await fs.mkdir(path.join(dir, "standalone"), { recursive: true });
  await fs.writeFile(path.join(dir, "standalone", "server.js"), "");

  assert.equal(resolveStandaloneRoot(dir), path.join(dir, "standalone"));
});

test("finds the standalone build in a development checkout", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticketflow-dev-"));
  await fs.mkdir(path.join(dir, ".next", "standalone"), { recursive: true });
  await fs.writeFile(path.join(dir, ".next", "standalone", "server.js"), "");

  assert.equal(resolveStandaloneRoot(dir), path.join(dir, ".next", "standalone"));
});

test("reports a missing build rather than guessing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticketflow-empty-"));
  assert.equal(resolveStandaloneRoot(dir), null);
});

test("startBackend explains an unbuilt app instead of throwing ENOENT", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticketflow-unbuilt-"));

  await assert.rejects(
    () => startBackend({ appRoot: dir }),
    (err) => {
      assert.match(err.message, /npm run build/);
      return true;
    },
  );
});

// --- End to end -----------------------------------------------------------

test("starts a server, reports its URL, and stops it again", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticketflow-fake-"));
  const standalone = path.join(dir, "standalone");
  await fs.mkdir(standalone, { recursive: true });

  // A stand-in for the Next standalone server: same contract, no build needed.
  await fs.writeFile(
    path.join(standalone, "server.js"),
    `const http = require("node:http");
     http.createServer((req, res) => res.end(process.env.APP_URL))
       .listen(process.env.PORT, process.env.HOSTNAME);`,
  );

  const backend = await startBackend({ appRoot: dir, withWorker: false });

  try {
    assert.match(backend.url, /^http:\/\/127\.0\.0\.1:\d+$/);

    // APP_URL must reach the child, or portal and invite links point nowhere.
    const body = await (await fetch(backend.url)).text();
    assert.equal(body, backend.url);
  } finally {
    backend.stop();
  }

  // The child is gone, and a second stop() is harmless.
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await waitForServer(backend.url, { timeoutMs: 400, intervalMs: 100 }), false);
  backend.stop();
});

test("starts the worker alongside the server when one is bundled", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ticketflow-worker-"));
  const standalone = path.join(dir, "standalone");
  await fs.mkdir(standalone, { recursive: true });

  await fs.writeFile(
    path.join(standalone, "server.js"),
    `require("node:http").createServer((q, s) => s.end("ok"))
       .listen(process.env.PORT, process.env.HOSTNAME);`,
  );
  const marker = path.join(dir, "worker-ran");
  await fs.writeFile(
    path.join(standalone, "worker.mjs"),
    `import fs from "node:fs";
     fs.writeFileSync(${JSON.stringify(marker)}, "yes");
     setInterval(() => {}, 1000);`,
  );

  const backend = await startBackend({ appRoot: dir });

  try {
    assert.equal(backend.children.length, 2, "server and worker");
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(await fs.readFile(marker, "utf8"), "yes");
  } finally {
    backend.stop();
  }
});
