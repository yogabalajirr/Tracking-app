"use client";

import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Pie, PieChart } from "recharts";
import { getFoodLogsForDate } from "@/lib/foodLog";
import { useEffect, useMemo, useState } from "react";

const sampleMacros = [
  { name: "Protein", value: 90, fill: "var(--chart-1)" },
  { name: "Carbs", value: 220, fill: "var(--chart-2)" },
  { name: "Fat", value: 70, fill: "var(--chart-3)" },
];

export default function DashboardPage() {
  const goal = 2200;
  const today = new Date().toISOString().slice(0, 10);
  const [logs, setLogs] = useState(() => getFoodLogsForDate(today));
  useEffect(() => {
    const id = setInterval(() => setLogs(getFoodLogsForDate(today)), 1500);
    return () => clearInterval(id);
  }, [today]);
  const consumed = logs.reduce((sum, e) => sum + e.calories, 0);
  const burned = 0;
  const remaining = goal - (consumed - burned);
  const progress = Math.min(100, Math.max(0, Math.round(((consumed - burned) / goal) * 100)));

  return (
    <Protected>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Daily Summary</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded border p-3">
                <div className="text-muted-foreground">Consumed</div>
                <div className="text-xl font-semibold">{consumed} kcal</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-muted-foreground">Burned</div>
                <div className="text-xl font-semibold">{burned} kcal</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-muted-foreground">Remaining</div>
                <div className="text-xl font-semibold">{remaining} kcal</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-muted-foreground">Goal</div>
                <div className="text-xl font-semibold">{goal} kcal</div>
              </div>
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Macros</h2>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{}}
              className="mx-auto aspect-square max-h-[240px]"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                <Pie data={sampleMacros} dataKey="value" nameKey="name" innerRadius={40} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Today's Foods</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="text-sm text-muted-foreground">Entries: {logs.length}</div>
            <div className="rounded border divide-y">
              {logs.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2">
                  <span className="truncate mr-2">[{e.mealType}] {e.name} × {e.quantity}</span>
                  <span className="text-sm text-muted-foreground">{e.calories} kcal</span>
                </div>
              ))}
              {logs.length === 0 && <div className="p-3 text-sm text-muted-foreground">No foods yet</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </Protected>
  );
}


