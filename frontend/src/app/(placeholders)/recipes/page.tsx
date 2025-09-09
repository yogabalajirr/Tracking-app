"use client";

import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function RecipesPage() {
  return (
    <Protected>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Recipe Suggestions</h2>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Coming soon. Discover simple, macro-friendly recipes.</p>
        </CardContent>
      </Card>
    </Protected>
  );
}



