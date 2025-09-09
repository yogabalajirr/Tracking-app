"use client";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type FoodLogEntry = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantity: number;
  mealType: MealType;
  timestamp: string; // ISO
  date: string; // YYYY-MM-DD
};

const STORAGE_KEY = "calorie_tracker_food_log";

function safeParse(json: string | null): FoodLogEntry[] {
  try {
    return json ? (JSON.parse(json) as FoodLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function getAllFoodLogs(): FoodLogEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

export function getFoodLogsForDate(date: string): FoodLogEntry[] {
  return getAllFoodLogs().filter((e) => e.date === date);
}

export function addFoodLogEntry(entry: Omit<FoodLogEntry, "id" | "timestamp" | "date">) {
  if (typeof window === "undefined") return;
  const now = new Date();
  const iso = now.toISOString();
  const date = iso.slice(0, 10);
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const newEntry: FoodLogEntry = { id, timestamp: iso, date, ...entry };
  const all = getAllFoodLogs();
  all.unshift(newEntry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearFoodLogsForDate(date: string) {
  if (typeof window === "undefined") return;
  const remaining = getAllFoodLogs().filter((e) => e.date !== date);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}



