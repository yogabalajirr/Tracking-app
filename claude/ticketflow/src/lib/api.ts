import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getCurrentUser, type SessionUser } from "./auth";
import { tenantDb, TenantIsolationError, type TenantDb } from "./db";
import { can, type Permission } from "./rbac";
import { clientKey, hit } from "./rate-limit";

/** Thrown by handlers to produce a specific status with a human-readable message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (m: string, d?: unknown) => new ApiError(400, m, d);
export const unauthorized = (m = "You need to sign in to do that.") => new ApiError(401, m);
export const forbidden = (m = "You don't have permission to do that.") => new ApiError(403, m);
export const notFound = (m = "Not found.") => new ApiError(404, m);
export const conflict = (m: string) => new ApiError(409, m);
export const tooMany = (m = "Too many requests. Please slow down.") => new ApiError(429, m);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Uniform error shape: `{ error: string, details?: unknown }`. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, ...(err.details ? { details: err.details } : {}) },
      { status: err.status },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Some fields need attention.",
        details: err.issues.map((i) => ({
          field: i.path.join(".") || "(root)",
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  if (err instanceof TenantIsolationError) {
    // Never leak that the row exists in another workspace.
    console.error("[tenant]", err.message);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Prisma "record not found" surfaces on scoped update/delete of a foreign id.
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (code === "P2002") {
      return NextResponse.json({ error: "That already exists." }, { status: 409 });
    }
  }

  console.error("[api]", err);
  return NextResponse.json(
    { error: "Something went wrong on our end. Please try again." },
    { status: 500 },
  );
}

export type AuthedContext = {
  user: SessionUser;
  db: TenantDb;
  workspaceId: string;
};

type RouteParams = { params?: Promise<Record<string, string>> };

/**
 * Wraps an authenticated route handler: resolves the session, checks the
 * required permission, hands the handler a workspace-scoped Prisma client, and
 * converts thrown errors into consistent JSON.
 */
export function withAuth<T extends RouteParams>(
  permission: Permission,
  handler: (req: Request, ctx: AuthedContext, routeCtx: T) => Promise<Response>,
) {
  return async (req: Request, routeCtx: T): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) throw unauthorized();
      if (!can(user.role, permission)) throw forbidden();

      return await handler(
        req,
        { user, db: tenantDb(user.workspaceId), workspaceId: user.workspaceId },
        routeCtx,
      );
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/**
 * Wraps a public (unauthenticated) route handler with rate limiting. Used by
 * the embeddable form, the customer portal and the inbound email webhook.
 */
export function withPublic<T extends RouteParams>(
  opts: { name: string; limit: number; windowMs: number },
  handler: (req: Request, routeCtx: T) => Promise<Response>,
) {
  return async (req: Request, routeCtx: T): Promise<Response> => {
    try {
      const result = hit(clientKey(req, opts.name), opts.limit, opts.windowMs);
      if (!result.ok) {
        return NextResponse.json(
          { error: "Too many requests. Please try again shortly." },
          {
            status: 429,
            headers: { "Retry-After": String(result.retryAfterSeconds) },
          },
        );
      }
      return await handler(req, routeCtx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Parse + validate a JSON body, throwing a 422 with field-level detail. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

/** Parse + validate query params from the request URL. */
export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return schema.parse(obj);
}
