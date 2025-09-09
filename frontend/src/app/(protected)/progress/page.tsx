"use client";

import { useState } from "react";
import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

type WeightEntry = { date: string; weight: number };

export default function ProgressPage() {
  const [entries, setEntries] = useState<WeightEntry[]>([
    { date: "2024-12-01", weight: 74 },
    { date: "2025-01-01", weight: 73.4 },
    { date: "2025-02-01", weight: 72.8 },
  ]);
  const [weight, setWeight] = useState<number>(72.5);

  const add = () => {
    if (!weight || weight <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    setEntries((e) => [...e, { date: today, weight }]);
  };

  return (
    <Protected>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Log Weight</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="weight">Weight (kg)</label>
              <Input id="weight" type="number" step="0.1" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
            </div>
            <Button onClick={add}>Add</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Trend</h2>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={entries}>
                  <XAxis dataKey="date" hide tickLine axisLine />
                  <YAxis domain={["dataMin - 2", "dataMax + 2"]} width={30} tickLine axisLine />
                  <ChartTooltip content={<ChartTooltipContent nameKey="weight" />} />
                  <Line type="monotone" dataKey="weight" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </Protected>
  );
}



