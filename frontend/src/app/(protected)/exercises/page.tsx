"use client";

import { useState } from "react";
import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Exercise = {
  type: string;
  duration: number; // minutes
  calories: number; // kcal
};

export default function ExercisesPage() {
  const [entries, setEntries] = useState<Exercise[]>([]);
  const [form, setForm] = useState<Exercise>({ type: "", duration: 30, calories: 200 });

  const add = () => {
    if (!form.type || form.duration <= 0 || form.calories <= 0) return;
    setEntries((e) => [form, ...e]);
    setForm({ type: "", duration: 30, calories: 200 });
  };

  const total = entries.reduce((acc, e) => acc + e.calories, 0);

  return (
    <Protected>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Log Exercise</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="type">Type</label>
              <Input id="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Running, Cycling, Yoga..." />
            </div>
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="duration">Duration (min)</label>
              <Input id="duration" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="calories">Calories burned</label>
              <Input id="calories" type="number" value={form.calories} onChange={(e) => setForm({ ...form, calories: Number(e.target.value) })} />
            </div>
            <Button onClick={add}>Add</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">History</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="text-sm text-muted-foreground">Total burned today: {total} kcal</div>
            <div className="rounded border divide-y">
              {entries.map((e, idx) => (
                <div className="flex items-center justify-between px-3 py-2" key={idx}>
                  <span>{e.type} — {e.duration} min</span>
                  <span className="text-sm text-muted-foreground">{e.calories} kcal</span>
                </div>
              ))}
              {entries.length === 0 && <div className="p-3 text-sm text-muted-foreground">No entries yet</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </Protected>
  );
}



