"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * In production the message from a Server Component is deliberately generic, so
 * the digest is the thing worth showing — it is what matches this crash to a
 * line in the server log. `retry` re-renders the segment, which is often all a
 * transient database blip needs.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  React.useEffect(() => {
    console.error("[route]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-5 text-destructive" />
        </div>

        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This page failed to load. Your tickets are safe — nothing was lost.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => retry()}>
            <RotateCw /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/inbox">Back to inbox</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
