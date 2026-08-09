/**
 * Stands in for `server-only` when a server module is bundled into a plain
 * Node process (the SLA worker). The real package throws on import outside a
 * React Server Component, which is right for the app and wrong for the worker.
 */
module.exports = {};
