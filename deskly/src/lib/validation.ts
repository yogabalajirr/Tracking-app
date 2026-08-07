import { z } from "zod";

/** Subdomains become part of a public URL and an email address. */
export const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters.")
  .max(40, "Keep it under 40 characters.")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers and hyphens only.",
  )
  .refine((v) => !RESERVED_SUBDOMAINS.has(v), "That subdomain is reserved.");

export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "support",
  "mail",
  "smtp",
  "portal",
  "help",
  "status",
  "docs",
  "blog",
  "static",
  "assets",
  "deskly",
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .email("That doesn't look like a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That password is too long.");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Keep it under 120 characters.");

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  workspaceName: z.string().trim().min(1, "Workspace name is required.").max(120),
  subdomain: subdomainSchema,
  timezone: z.string().trim().min(1).default("Asia/Kolkata"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: nameSchema,
  password: passwordSchema,
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "AGENT", "VIEWER"]),
  teamId: z.string().cuid().nullish(),
});

/** Turns a workspace name into a plausible default subdomain. */
export function suggestSubdomain(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
