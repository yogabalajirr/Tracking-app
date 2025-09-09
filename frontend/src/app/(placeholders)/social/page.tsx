"use client";

import Protected from "@/components/layout/Protected";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SocialPage() {
  return (
    <Protected>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Social Feed</h2>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Coming soon. Share progress and cheer friends.</p>
        </CardContent>
      </Card>
    </Protected>
  );
}



