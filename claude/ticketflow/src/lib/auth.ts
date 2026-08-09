import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { env } from "./env";
import { hashToken, randomToken } from "./tokens";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "ticketflow_session";
const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 12;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  teamId: string | null;
  workspaceId: string;
  workspace: {
    id: string;
    name: string;
    subdomain: string;
    timezone: string;
    brandColor: string | null;
    logoUrl: string | null;
  };
};

// --- Passwords ------------------------------------------------------------

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Constant-ish work even when the account does not exist, so response timing
 * does not reveal whether an email is registered.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.cVSCX6HRfvfLc7WsG1WnbNjkG5jvjqW";

export async function verifyPasswordSafely(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

// --- Sessions -------------------------------------------------------------

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const hdrs = await headers();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: hdrs.get("user-agent")?.slice(0, 255) ?? null,
      ipAddress:
        hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Resolves the signed-in user, or null. Memoised per request via `cache()` so
 * a page and its nested layouts share one query.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { workspace: true } } },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    teamId: user.teamId,
    workspaceId: user.workspaceId,
    workspace: {
      id: user.workspace.id,
      name: user.workspace.name,
      subdomain: user.workspace.subdomain,
      timezone: user.workspace.timezone,
      brandColor: user.workspace.brandColor,
      logoUrl: user.workspace.logoUrl,
    },
  };
});

/** Best-effort cleanup of expired rows; called opportunistically on login. */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);
}
