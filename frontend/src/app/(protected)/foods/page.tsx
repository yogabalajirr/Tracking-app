"use client";

import { useEffect, useMemo, useState } from "react";
import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { addFoodLogEntry, type MealType } from "@/lib/foodLog";

type Food = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const defaultFoods: Food[] = [];

export default function FoodsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Food | null>(null);
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [quantity, setQuantity] = useState<number>(1);
  const [log, setLog] = useState<Food[]>([]);

  const [foodsRemote, setFoodsRemote] = useState<Food[]>([]);
  const foods = useMemo(() => {
    const src = foodsRemote.length ? foodsRemote : defaultFoods;
    return src.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));
  }, [query, foodsRemote]);

  useEffect(() => {
    setSelected(foods[0] || null);
  }, [foods.length]);

  useEffect(() => {
    // fetch foods from API
    (async () => {
      try {
        const res = await api.get<Food[]>(`/foods?q=${encodeURIComponent(query)}`);
        setFoodsRemote(res.data);
      } catch {
        // ignore, fallback to defaults
      }
    })();
  }, [query]);

  const addFood = () => {
    if (!selected) return;
    setLog((l) => [selected, ...l]);
    addFoodLogEntry({
      name: selected.name,
      calories: selected.calories * quantity,
      protein: selected.protein * quantity,
      carbs: selected.carbs * quantity,
      fat: selected.fat * quantity,
      quantity,
      mealType,
    });
  };

  const totals = log.reduce(
    (acc, f) => {
      acc.calories += f.calories;
      acc.protein += f.protein;
      acc.carbs += f.carbs;
      acc.fat += f.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <Protected>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Search Foods</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input placeholder="Search Indian dishes..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="max-h-64 overflow-auto rounded border">
              {foods.map((f) => (
                <button key={f.id} onClick={() => setSelected(f)} className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-secondary ${selected?.id === f.id ? "bg-secondary" : ""}`}>
                  <span>{f.name}</span>
                  <span className="text-sm text-muted-foreground">{f.calories} kcal</span>
                </button>
              ))}
              {foods.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">No results</div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select className="border rounded px-2 py-1" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
              <Button onClick={addFood} disabled={!selected}>Add to log</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Today's Log</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="text-sm text-muted-foreground">Totals: {totals.calories} kcal — P {totals.protein}g • C {totals.carbs}g • F {totals.fat}g</div>
            <div className="rounded border divide-y">
              {log.map((f, idx) => (
                <div key={`${f.id}-${idx}`} className="flex items-center justify-between px-3 py-2">
                  <span>{f.name}</span>
                  <span className="text-sm text-muted-foreground">{f.calories} kcal</span>
                </div>
              ))}
              {log.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">No foods logged yet</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Protected>
  );
}


