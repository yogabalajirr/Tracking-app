"use client";

import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AIMealPlannerPage() {
  return (
    <Protected>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">AI Meal Planner</h2>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground">Coming soon. Get personalized meal plans based on your goals.</p>
          <Button disabled>Generate Plan</Button>
        </CardContent>
      </Card>
    </Protected>
  );
}



