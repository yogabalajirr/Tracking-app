"use strict";

/**
 * Process supervision for the packaged app.
 *
 * Deliberately free of any `electron` import: this is the part with real logic
 * — port selection, spawning, health-polling, shutdown — so it needs to be
 * runnable and testable under plain Node. `main.js` is the window shell that
 * consumes it. Run `npm run test:electron` to exercise this file.
 */

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

/**
 * Ask the OS for a free port, then close and hand back the number.
 *
 * There is a race here in principle — something else could take the port
 * between close and spawn — but binding a fixed port is worse: a second copy
 * of the app, or any stray dev server, would collide every time.
 */
function findFreePort(preferred = 0) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", (err) => {
      if (preferred !== 0) {
        // The preferred port is taken; fall back to whatever is free.
        findFreePort(0).then(resolve, reject);
      } else {
        reject(err);
      }
    });
    probe.listen(preferred, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Poll until the server answers anything at all, or give up. */
async function waitForServer(url, { timeoutMs = 45_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      // Any HTTP status means the server is listening; a redirect is a
      // perfectly good sign of life, so this does not check res.ok.
      await fetch(url, { redirect: "manual" });
      return true;
    } catch {
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

/**
 * Locate the Next standalone build.
 *
 * Packaged, it sits in the asar-unpacked resources directory; in development
 * it is `.next/standalone` in the repo. Returning null lets the caller show a
 * real message instead of a stack trace.
 */
function resolveStandaloneRoot(appRoot) {
  const candidates = [
    path.join(appRoot, "standalone", "server.js"),
    path.join(appRoot, ".next", "standalone", "server.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.dirname(candidate);
  }
  return null;
}

/**
 * Start a Node child and keep its output on our stdio.
 *
 * `execPath` matters: inside a packaged Electron app `process.execPath` is the
 * Electron binary, which only behaves as Node when ELECTRON_RUN_AS_NODE is set.
 */
function spawnNode(scriptPath, { cwd, env, execPath = process.execPath, label }) {
  const child = spawn(execPath, [scriptPath], {
    cwd,
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `[${label}]`;
  child.stdout.on("data", (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  child.on("error", (err) => console.error(`${prefix} failed to start:`, err));

  return child;
}

/**
 * Bring up the web server and (optionally) the SLA worker.
 *
 * Returns the URL to load plus a `stop()` that takes both down. `stop()` is
 * idempotent because it gets called from several exit paths — window-closed,
 * before-quit, and a signal handler — and only the first should do anything.
 */
async function startBackend({
  appRoot,
  preferredPort = 4123,
  env = process.env,
  withWorker = true,
} = {}) {
  const standaloneRoot = resolveStandaloneRoot(appRoot);
  if (!standaloneRoot) {
    throw new Error(
      "Could not find the built server. Run `npm run build` before starting the desktop app.",
    );
  }

  const port = await findFreePort(preferredPort);
  const url = `http://127.0.0.1:${port}`;

  const childEnv = {
    ...env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    // The app is only ever reached over loopback, so the public URL is the
    // loopback URL — portal and invite links have to resolve for the user.
    APP_URL: url,
    NEXT_PUBLIC_APP_URL: url,
    NODE_ENV: "production",
  };

  const children = [];
  children.push(
    spawnNode(path.join(standaloneRoot, "server.js"), {
      cwd: standaloneRoot,
      env: childEnv,
      label: "web",
    }),
  );

  if (withWorker) {
    const workerPath = path.join(standaloneRoot, "worker.mjs");
    if (fs.existsSync(workerPath)) {
      children.push(
        spawnNode(workerPath, { cwd: standaloneRoot, env: childEnv, label: "worker" }),
      );
    } else {
      console.warn("[worker] not bundled — SLA timers will not run in this build");
    }
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const child of children) {
      if (!child.killed) child.kill("SIGTERM");
    }
  };

  const ready = await waitForServer(`${url}/login`);
  if (!ready) {
    stop();
    throw new Error(`The server did not start listening on ${url} in time.`);
  }

  return { url, port, stop, children };
}

module.exports = {
  findFreePort,
  waitForServer,
  resolveStandaloneRoot,
  startBackend,
};
