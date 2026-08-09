import { z } from "zod";
import { json, parseQuery, withAuth } from "@/lib/api";
import { buildBreakdowns, buildOverview, buildVolume } from "@/lib/reports";

const querySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("7d"),
});

export const GET = withAuth("reports.read", async (req, { workspaceId }) => {
  const { range } = parseQuery(req, querySchema);
  const now = new Date();

  const [overview, volume, breakdowns] = await Promise.all([
    buildOverview(workspaceId, range, now),
    buildVolume(workspaceId, range, now),
    buildBreakdowns(workspaceId, range, now),
  ]);

  return json({ overview, volume, breakdowns });
});
