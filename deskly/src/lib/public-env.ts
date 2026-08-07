/**
 * The handful of values client components legitimately need. Anything added
 * here is bundled into the browser payload, so it must never hold a secret.
 * `NEXT_PUBLIC_*` reads are inlined at build time by Next.
 */
export const env = {
  emailDomain: process.env.NEXT_PUBLIC_EMAIL_DOMAIN || "deskly.local",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
