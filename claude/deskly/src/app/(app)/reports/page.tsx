import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  buildAgentStats,
  buildBreakdowns,
  buildOverview,
  buildVolume,
  type Range,
} from "@/lib/reports";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { range: rawRange } = await searchParams;
  const range: Range = rawRange === "30d" || rawRange === "90d" ? rawRange : "7d";

  const now = new Date();
  const [overview, volume, breakdowns, agents] = await Promise.all([
    buildOverview(user.workspaceId, range, now),
    buildVolume(user.workspaceId, range, now),
    buildBreakdowns(user.workspaceId, range, now),
    buildAgentStats(user.workspaceId, range, now),
  ]);

  return (
    <ReportsView
      range={range}
      overview={overview}
      volume={volume}
      breakdowns={breakdowns}
      agents={agents}
      timezone={user.workspace.timezone}
    />
  );
}
