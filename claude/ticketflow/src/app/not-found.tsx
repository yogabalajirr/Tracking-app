import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/**
 * Also what a ticket from another workspace looks like: the tenant guard turns
 * a cross-workspace id into a 404 rather than a 403, so the page must not imply
 * that the thing exists somewhere.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-1 text-lg font-semibold">We couldn&rsquo;t find that</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The link may be out of date, or the ticket may belong to a different workspace.
        </p>

        <div className="mt-5 flex justify-center gap-2">
          <Button asChild>
            <Link href="/inbox">Go to inbox</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
