import { getCurrentUser } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { env } from "@/lib/env";
import { readLocalAttachment } from "@/lib/storage";
import { verifyPortalToken } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * Serves locally stored attachments.
 *
 * Two ways in: a signed-in agent whose workspace owns the file, or a customer
 * holding a valid portal token for the ticket the file belongs to. The key's
 * first segment is the workspace id, which is checked against both.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (env().STORAGE_DRIVER !== "local") {
    return new Response("Attachments are served directly from object storage.", {
      status: 404,
    });
  }

  const { key } = await params;
  const storageKey = key.join("/");
  const [workspaceId] = key;

  if (!workspaceId) return new Response("Not found", { status: 404 });

  const authorised = await isAuthorised(request, workspaceId, storageKey);
  if (!authorised) return new Response("Not found", { status: 404 });

  const file = await readLocalAttachment(storageKey);
  if (!file) return new Response("Not found", { status: 404 });

  const attachment = await tenantDb(workspaceId).attachment.findFirst({
    where: { url: `/api/attachments/${storageKey}` },
    select: { filename: true, mimeType: true },
  });

  return new Response(new Uint8Array(file.content), {
    headers: {
      // Never inline: an uploaded HTML or SVG file rendered on our own origin
      // would be a stored-XSS vector.
      "Content-Type": attachment?.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(attachment?.filename ?? "file").replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

async function isAuthorised(
  request: Request,
  workspaceId: string,
  storageKey: string,
): Promise<boolean> {
  const user = await getCurrentUser();
  if (user?.workspaceId === workspaceId) return true;

  // Customer portal: the token must be valid for the ticket owning this file.
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const ticketId = url.searchParams.get("ticket");
  if (!token || !ticketId || !verifyPortalToken(token, ticketId)) return false;

  const attachment = await tenantDb(workspaceId).attachment.findFirst({
    where: {
      url: `/api/attachments/${storageKey}`,
      message: { ticketId, isInternal: false },
    },
    select: { id: true },
  });

  return Boolean(attachment);
}
