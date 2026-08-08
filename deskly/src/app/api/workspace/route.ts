import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { supportAddress } from "@/lib/env";

/**
 * The workspace is implied by the session, so these routes take no id. That is
 * a deliberate simplification of the spec's `/api/workspaces/:id/…` shape: with
 * one workspace per user there is nothing to disambiguate, and no id in the
 * URL means no IDOR surface to get wrong. See DECISIONS.md.
 */

export const GET = withAuth("workspace.read", async (_req, { workspaceId }) => {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      subdomain: true,
      logoUrl: true,
      brandColor: true,
      timezone: true,
      businessHours: true,
      createdAt: true,
    },
  });

  return json({
    workspace: { ...workspace, supportEmail: supportAddress(workspace.subdomain) },
  });
});

const timeRange = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM."),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM."),
});

const patchSchema = z.object({
  name: z.string().trim().min(1, "Give your workspace a name.").max(120).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex colour like #4f46e5.")
    .nullish(),
  logoUrl: z.string().url("That doesn't look like a URL.").nullish(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "That isn't a recognised timezone.")
    .optional(),
  businessHours: z
    .object({
      days: z.record(z.string(), z.array(timeRange)),
      holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")),
    })
    .optional(),
});

export const PATCH = withAuth("workspace.manage", async (req, { workspaceId }) => {
  const input = await parseBody(req, patchSchema);

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.brandColor !== undefined ? { brandColor: input.brandColor } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.businessHours !== undefined
        ? { businessHours: input.businessHours as object }
        : {}),
    },
    select: {
      id: true,
      name: true,
      subdomain: true,
      logoUrl: true,
      brandColor: true,
      timezone: true,
      businessHours: true,
    },
  });

  return json({ workspace });
});
