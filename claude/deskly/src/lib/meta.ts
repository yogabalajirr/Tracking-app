import "server-only";
import { prisma, tenantDb } from "./db";

/**
 * The reference data the inbox needs to render its filters, assignee pickers
 * and macro list. Loaded once in the inbox layout and passed down, so the
 * client panes never have to fan out into a handful of small requests.
 */
export type WorkspaceMeta = {
  workspace: { id: string; name: string; subdomain: string; timezone: string };
  agents: { id: string; name: string; email: string; avatarUrl: string | null }[];
  teams: { id: string; name: string }[];
  tags: { id: string; name: string; color: string | null }[];
  savedViews: { id: string; name: string; filters: unknown; userId: string | null }[];
  cannedResponses: {
    id: string;
    shortcode: string;
    title: string;
    body: string;
    userId: string | null;
  }[];
};

export async function loadWorkspaceMeta(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMeta> {
  const db = tenantDb(workspaceId);

  const [workspace, agents, teams, tags, savedViews, cannedResponses] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, subdomain: true, timezone: true },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
    db.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    // Shared views plus the caller's own.
    db.savedView.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true, filters: true, userId: true },
      orderBy: { createdAt: "asc" },
    }),
    db.cannedResponse.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, shortcode: true, title: true, body: true, userId: true },
      orderBy: { shortcode: "asc" },
    }),
  ]);

  return { workspace, agents, teams, tags, savedViews, cannedResponses };
}
