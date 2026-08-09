import { z } from "zod";
import { json, parseQuery, withAuth } from "@/lib/api";
import { buildAgentStats } from "@/lib/reports";

const querySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export const GET = withAuth("reports.read", async (req, { workspaceId }) => {
  const { range } = parseQuery(req, querySchema);
  const agents = await buildAgentStats(workspaceId, range);
  return json({ agents, range });
});
