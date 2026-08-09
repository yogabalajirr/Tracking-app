import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * Models that are owned by exactly one workspace. Every one of them carries a
 * `workspaceId` column (denormalised on purpose — see prisma/schema.prisma) so
 * the tenant guard below applies uniformly, with no relation traversal.
 */
const TENANT_MODELS = new Set([
  "User",
  "Invite",
  "Team",
  "Customer",
  "Ticket",
  "Message",
  "Activity",
  "Attachment",
  "SlaPolicy",
  "AssignmentRule",
  "Tag",
  "CannedResponse",
  "SavedView",
  "Notification",
]);

/**
 * Operations that accept a `where` we can constrain. This includes the
 * by-unique operations: since Prisma 5, `WhereUniqueInput` accepts extra
 * non-unique filters alongside the unique selector, so merging `workspaceId`
 * is both type-valid and enforced *before* the row is touched. A cross-tenant
 * target therefore fails with P2025 (not found) rather than being mutated.
 */
const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
  "count",
  "aggregate",
  "groupBy",
]);

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env().DATABASE_URL }),
    log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prismaGlobal?: ReturnType<typeof createPrismaClient>;
};

/**
 * Unscoped client. Use ONLY where no tenant is established yet: signup, login,
 * session lookup, invite acceptance, and the inbound webhook while it is still
 * resolving which workspace an email belongs to. Everything else must go
 * through `tenantDb()`.
 */
export const prisma = globalForPrisma.prismaGlobal ?? createPrismaClient();

if (env().NODE_ENV !== "production") {
  globalForPrisma.prismaGlobal = prisma;
}

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/**
 * Returns a Prisma client permanently scoped to one workspace.
 *
 * This is the enforcement point required by the multi-tenancy constraint: a
 * query issued through it cannot read or write another workspace's rows even
 * if the calling code forgets to filter, because every tenant-model query gets
 * `workspaceId` merged into its `where`, and every create gets `workspaceId`
 * injected into its `data`.
 */
export function tenantDb(workspaceId: string) {
  if (!workspaceId) {
    throw new TenantIsolationError("tenantDb() called without a workspaceId");
  }

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }

          const a = (args ?? {}) as Record<string, unknown>;

          if (WHERE_OPS.has(operation)) {
            a.where = { ...((a.where as object) ?? {}), workspaceId };
          }

          if (operation === "create") {
            a.data = { ...((a.data as object) ?? {}), workspaceId };
          }

          if (operation === "upsert") {
            a.create = { ...((a.create as object) ?? {}), workspaceId };
          }

          if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = a.data;
            a.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as object), workspaceId }))
              : { ...((data as object) ?? {}), workspaceId };
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
