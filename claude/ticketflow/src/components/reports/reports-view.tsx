"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Table2, TrendingDown, TrendingUp } from "lucide-react";
import { Avatar, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CHANNEL_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { AgentRow, Breakdown, Overview, Range, VolumePoint } from "@/lib/reports";
import type { Channel, Priority, TicketStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

/** Minutes → "2h 15m". Reporting numbers are meaningless as raw minutes. */
function duration(minutes: number | null): string {
  if (minutes === null) return "—";
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return rest ? `${h}h ${rest}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function ReportsView({
  range,
  overview,
  volume,
  breakdowns,
  agents,
  timezone,
}: {
  range: Range;
  overview: Overview;
  volume: VolumePoint[];
  breakdowns: {
    byChannel: Breakdown;
    byPriority: Breakdown;
    byStatus: Breakdown;
    byTag: Breakdown;
  };
  agents: AgentRow[];
  timezone: string;
}) {
  const router = useRouter();
  const [showTable, setShowTable] = React.useState(false);

  const hasData = overview.created > 0 || overview.openNow > 0;

  return (
    <div
      className="viz-root h-full overflow-y-auto scroll-slim"
      // Validated categorical slots 1 and 2 (blue / orange), stepped per mode.
      // See references/palette.md — both modes pass all six checks.
      style={
        {
          "--series-created": "var(--viz-series-1)",
          "--series-resolved": "var(--viz-series-2)",
        } as React.CSSProperties
      }
    >
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Reports</h1>
            <p className="text-sm text-muted-foreground">
              Times shown in {timezone}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Date range" className="flex rounded-md border border-border p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  role="radio"
                  aria-checked={range === r.value}
                  onClick={() => router.push(`/reports?range=${r.value}`)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    range === r.value
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowTable((v) => !v)}>
              <Table2 /> {showTable ? "Hide" : "Show"} table
            </Button>

            <Button variant="outline" size="sm" asChild>
              <a href={`/api/reports/export?dataset=tickets&range=${range}`}>
                <Download /> Tickets CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/reports/export?dataset=agents&range=${range}`}>
                <Download /> Agents CSV
              </a>
            </Button>
          </div>
        </header>

        {!hasData ? (
          <EmptyState
            icon={Table2}
            title="No ticket data yet"
            description="Once tickets start arriving, this page fills in with volumes, response times and SLA compliance."
          />
        ) : (
          <>
            <section aria-label="Headline metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label="Tickets created"
                value={overview.created}
                previous={overview.previous.created}
              />
              <Stat
                label="Tickets resolved"
                value={overview.resolved}
                previous={overview.previous.resolved}
              />
              <Stat
                label="SLA compliance"
                value={
                  overview.slaCompliancePercent === null
                    ? "—"
                    : `${overview.slaCompliancePercent.toFixed(0)}%`
                }
              />
              <Stat
                label="Avg first response"
                value={duration(overview.avgFirstResponseMinutes)}
                previous={overview.previous.avgFirstResponseMinutes}
                current={overview.avgFirstResponseMinutes}
                lowerIsBetter
              />
              <Stat
                label="Avg resolution"
                value={duration(overview.avgResolutionMinutes)}
                previous={overview.previous.avgResolutionMinutes}
                current={overview.avgResolutionMinutes}
                lowerIsBetter
              />
              <Stat
                label="Open now"
                value={overview.openNow}
                hint={
                  overview.overdueNow > 0
                    ? `${overview.overdueNow} overdue`
                    : "None overdue"
                }
                hintTone={overview.overdueNow > 0 ? "bad" : "good"}
              />
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ticket volume</CardTitle>
              </CardHeader>
              <CardContent>
                <Legend
                  items={[
                    { label: "Created", color: "var(--series-created)" },
                    { label: "Resolved", color: "var(--series-resolved)" },
                  ]}
                />
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={volume} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                        tickFormatter={(d: string) =>
                          new Date(d).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        }
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        width={40}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                      <Line
                        type="monotone"
                        dataKey="created"
                        name="Created"
                        stroke="var(--series-created)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="resolved"
                        name="Resolved"
                        stroke="var(--series-resolved)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <BreakdownCard
                title="By channel"
                data={breakdowns.byChannel.map((d) => ({
                  ...d,
                  label: CHANNEL_LABELS[d.label as Channel] ?? d.label,
                }))}
              />
              <BreakdownCard
                title="By priority"
                data={breakdowns.byPriority.map((d) => ({
                  ...d,
                  label: PRIORITY_LABELS[d.label as Priority] ?? d.label,
                }))}
              />
              <BreakdownCard
                title="By status"
                data={breakdowns.byStatus.map((d) => ({
                  ...d,
                  label: STATUS_LABELS[d.label as TicketStatus] ?? d.label,
                }))}
              />
              <BreakdownCard title="Top tags" data={breakdowns.byTag} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agent leaderboard</CardTitle>
              </CardHeader>
              <CardContent>
                {agents.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No agents yet.</p>
                ) : (
                  <div className="overflow-x-auto scroll-slim">
                    <table className="w-full min-w-[560px] text-sm">
                      <caption className="sr-only">
                        Tickets assigned and resolved per agent for the selected range
                      </caption>
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-2 font-medium">Agent</th>
                          <th scope="col" className="py-2 text-right font-medium">Resolved</th>
                          <th scope="col" className="py-2 text-right font-medium">Assigned</th>
                          <th scope="col" className="py-2 text-right font-medium">Open now</th>
                          <th scope="col" className="py-2 text-right font-medium">Avg 1st reply</th>
                          <th scope="col" className="py-2 text-right font-medium">Avg resolution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agents.map((agent) => (
                          <tr key={agent.id} className="border-b border-border last:border-0">
                            <th scope="row" className="py-2 text-left font-normal">
                              <span className="flex items-center gap-2">
                                <Avatar
                                  name={agent.name}
                                  src={agent.avatarUrl}
                                  seed={agent.id}
                                  size={22}
                                />
                                {agent.name}
                              </span>
                            </th>
                            <td className="py-2 text-right font-medium tabular-nums">
                              {agent.resolved}
                            </td>
                            <td className="py-2 text-right tabular-nums">{agent.assigned}</td>
                            <td className="py-2 text-right tabular-nums">{agent.openNow}</td>
                            <td className="py-2 text-right tabular-nums">
                              {duration(agent.avgFirstResponseMinutes)}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {duration(agent.avgResolutionMinutes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {showTable && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Volume data</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-80 overflow-y-auto scroll-slim">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Tickets created and resolved per day
                      </caption>
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-2 font-medium">Date</th>
                          <th scope="col" className="py-2 text-right font-medium">Created</th>
                          <th scope="col" className="py-2 text-right font-medium">Resolved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {volume.map((point) => (
                          <tr key={point.date} className="border-b border-border last:border-0">
                            <th scope="row" className="py-1.5 text-left font-normal">
                              {point.date}
                            </th>
                            <td className="py-1.5 text-right tabular-nums">{point.created}</td>
                            <td className="py-1.5 text-right tabular-nums">{point.resolved}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="pb-2 text-xs text-muted-foreground">
              CSAT is recorded on resolved tickets but the survey UI ships in a later
              release —{" "}
              {overview.csatResponses > 0
                ? `${overview.csatAverage?.toFixed(1)} average across ${overview.csatResponses} scored tickets.`
                : "no scores yet."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  previous,
  current,
  lowerIsBetter,
  hint,
  hintTone,
}: {
  label: string;
  value: React.ReactNode;
  previous?: number | null;
  current?: number | null;
  lowerIsBetter?: boolean;
  hint?: string;
  hintTone?: "good" | "bad";
}) {
  // Trend compares like with like: counts use `value`, durations pass `current`.
  const now = current ?? (typeof value === "number" ? value : null);
  const showTrend = previous !== undefined && previous !== null && now !== null && previous > 0;

  let delta: number | null = null;
  if (showTrend) delta = ((now - previous) / previous) * 100;

  const improving = delta === null ? null : lowerIsBetter ? delta < 0 : delta > 0;

  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>

        {delta !== null && Math.abs(delta) >= 1 && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              improving ? "text-success" : "text-destructive",
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {Math.abs(delta).toFixed(0)}% vs previous period
          </p>
        )}

        {hint && (
          <p
            className={cn(
              "text-xs",
              hintTone === "bad" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** A single-series bar chart; one hue, so no legend is needed. */
function BreakdownCard({ title, data }: { title: string; data: Breakdown }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(160, sorted.length * 34) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 4, right: 28, bottom: 4, left: 4 }}
              barCategoryGap="22%"
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)" }} />
              <Bar
                dataKey="value"
                name="Tickets"
                fill="var(--series-created)"
                radius={[0, 4, 4, 0]}
                label={{
                  position: "right",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              >
                {sorted.map((entry) => (
                  <Cell key={entry.label} fill="var(--series-created)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-4">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

type TooltipPayload = { name?: string; value?: number; color?: string }[];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      <ul className="space-y-0.5">
        {payload.map((entry, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
