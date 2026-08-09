import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `standalone` emits `.next/standalone/server.js` with only the node_modules
   * the server actually reached for. The macOS app ships that directory rather
   * than the whole repo — see electron/server.js, which is what launches it.
   */
  output: "standalone",

  /**
   * Prisma's generated client loads its query engine by path at runtime, which
   * the bundler cannot see. Listing it here keeps it external so the engine
   * binary is resolved from node_modules instead of being inlined.
   */
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;
