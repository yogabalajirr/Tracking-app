import crypto from "node:crypto";
import { env } from "./env";

/**
 * Small HMAC-signed token helper used for anything a third party holds:
 * customer-portal links and workspace invites. Format:
 *
 *   <base64url(json payload)>.<base64url(hmac-sha256)>
 *
 * Payloads are readable by design (they carry no secrets) but not forgeable.
 */

type Payload = Record<string, unknown> & { exp?: number };

function sign(data: string, purpose: string): string {
  return crypto
    .createHmac("sha256", env().APP_SECRET)
    .update(`${purpose}:${data}`)
    .digest("base64url");
}

export function createToken(purpose: string, payload: Payload, ttlSeconds?: number): string {
  const body: Payload = { ...payload };
  if (ttlSeconds !== undefined) {
    body.exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  }
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${data}.${sign(data, purpose)}`;
}

export function verifyToken<T extends Payload>(purpose: string, token: string): T | null {
  if (!token || typeof token !== "string") return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const data = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(data, purpose);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload as T;
}

/** Opaque high-entropy token (session cookies, invite links). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Stored form of an opaque token — the raw value never hits the database. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// --- Customer portal ------------------------------------------------------

const PORTAL_PURPOSE = "portal";
/** Portal links live in customers' inboxes, so they are long-lived by design. */
const PORTAL_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

export function createPortalToken(ticketId: string): string {
  return createToken(PORTAL_PURPOSE, { t: ticketId }, PORTAL_TTL_SECONDS);
}

export function verifyPortalToken(token: string, ticketId: string): boolean {
  const payload = verifyToken<{ t?: string }>(PORTAL_PURPOSE, token);
  return payload?.t === ticketId;
}

export function portalUrl(ticketId: string): string {
  return `${env().APP_URL}/portal/ticket/${ticketId}?token=${createPortalToken(ticketId)}`;
}
