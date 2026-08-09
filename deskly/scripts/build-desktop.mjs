/**
 * Assemble the payload that ships inside the macOS app.
 *
 *   npm run build:desktop
 *
 * `next build` leaves `.next/standalone` incomplete by design: static assets
 * and `public/` are expected to be served by a CDN, so it does not copy them.
 * A desktop app has no CDN, so this puts them where the standalone server
 * looks. It also bundles the SLA worker to plain JS, because the packaged app
 * has no tsx to run the TypeScript original.
 */
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const standalone = path.join(root, ".next", "standalone");

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(from, to) {
  if (!(await exists(from))) return false;
  await fs.cp(from, to, { recursive: true });
  return true;
}

async function main() {
  if (!(await exists(path.join(standalone, "server.js")))) {
    console.error(
      "No standalone build found. Run `npm run build` first (next.config.ts sets output: 'standalone').",
    );
    process.exit(1);
  }

  // Static assets the standalone server serves but does not bundle.
  const copiedStatic = await copyDir(
    path.join(root, ".next", "static"),
    path.join(standalone, ".next", "static"),
  );
  const copiedPublic = await copyDir(path.join(root, "public"), path.join(standalone, "public"));

  console.log(`  static assets  ${copiedStatic ? "copied" : "skipped (none found)"}`);
  console.log(`  public/        ${copiedPublic ? "copied" : "skipped (none found)"}`);

  // The worker as a single ESM file with no tsx and no source imports left.
  await build({
    entryPoints: [path.join(root, "scripts", "worker.ts")],
    outfile: path.join(standalone, "worker.mjs"),
    bundle: true,
    platform: "node",
    target: "node22",
    // ESM, not CJS: the traced copy of @prisma/adapter-pg ships only its .mjs
    // entry, and the generated Prisma client reads `import.meta.url`.
    format: "esm",
    // Some dependencies in the graph are still CommonJS and call `require` at
    // runtime; ESM output has no such global, so one is provided.
    banner: {
      js: [
        'import { createRequire as __nodeCreateRequire } from "node:module";',
        "const require = __nodeCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    // Prisma resolves its query engine by path at runtime; bundling it would
    // break that lookup, so it stays external and is loaded from node_modules.
    external: ["@prisma/client", ".prisma/client", "@prisma/adapter-pg", "pg", "nodemailer"],
    // `server-only` throws outside a React Server Component; the worker is a
    // plain Node process, so the import is replaced with a no-op.
    alias: { "server-only": path.join(root, "scripts", "noop.js") },
    logLevel: "warning",
  });
  console.log("  worker.mjs     bundled");

  // The generated Prisma client lives under src/, which the standalone trace
  // may not have followed; make sure it is present next to the server.
  const generated = path.join(root, "src", "generated", "prisma");
  if (await exists(generated)) {
    await copyDir(generated, path.join(standalone, "src", "generated", "prisma"));
    console.log("  prisma client  copied");
  }

  console.log("\nDesktop payload ready in .next/standalone");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
