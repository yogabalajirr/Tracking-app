"use strict";

/**
 * The renderer runs sandboxed with context isolation on, so it gets no Node
 * access at all. This exposes the two facts the web app actually benefits from
 * knowing — that it is running inside the desktop shell, and on what platform —
 * and nothing else. Every capability added here is a capability a compromised
 * page inherits, so the surface stays this small on purpose.
 */

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("deskly", {
  desktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
