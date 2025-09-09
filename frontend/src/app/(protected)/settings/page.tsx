"use client";

import { useEffect, useState } from "react";
import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [age, setAge] = useState<number | undefined>(user?.age);
  const [weight, setWeight] = useState<number | undefined>(user?.weight);
  const [height, setHeight] = useState<number | undefined>(user?.height);

  useEffect(() => {
    setName(user?.name || "");
    setAge(user?.age);
    setWeight(user?.weight);
    setHeight(user?.height);
  }, [user?.id]);

  const save = async () => {
    // Placeholder: Will call backend later
    await new Promise((r) => setTimeout(r, 400));
    await refreshProfile();
    alert("Saved (dummy)");
  };

  return (
    <Protected>
      <div className="max-w-xl">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Profile</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="name">Name</label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="age">Age</label>
              <Input id="age" type="number" value={age ?? ""} onChange={(e) => setAge(Number(e.target.value))} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="weight">Weight (kg)</label>
              <Input id="weight" type="number" value={weight ?? ""} onChange={(e) => setWeight(Number(e.target.value))} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm" htmlFor="height">Height (cm)</label>
              <Input id="height" type="number" value={height ?? ""} onChange={(e) => setHeight(Number(e.target.value))} />
            </div>
            <Button onClick={save}>Save</Button>
          </CardContent>
        </Card>
      </div>
    </Protected>
  );
}



