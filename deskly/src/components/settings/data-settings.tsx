"use client";

import * as React from "react";
import { AlertTriangle, Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";

type Customer = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  _count: { tickets: number };
};

/**
 * GDPR / DPDP subject-access and erasure.
 *
 * Deletion is irreversible and takes the customer's tickets with it, so it is
 * gated behind typing the email address rather than a plain confirm dialog.
 */
export function DataSettings() {
  const [search, setSearch] = React.useState("");
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [confirming, setConfirming] = React.useState<Customer | null>(null);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async (term: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: term }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load customers.");
      setCustomers(data.customers);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetching on mount — and again whenever the query changes — is what an effect
  // is for. The lint rule below can't see that every setState happens after an
  // await, in the promise continuation rather than in the effect body itself.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("");
  }, [load]);

  // Debounce so typing doesn't fire a request per keystroke.
  React.useEffect(() => {
    if (search.length === 1) return;
    const id = setTimeout(() => void load(search), 300);
    return () => clearTimeout(id);
  }, [search, load]);

  async function erase() {
    if (!confirming || confirmText !== confirming.email) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/workspace/data?email=${encodeURIComponent(confirming.email)}`,
        { method: "DELETE" },
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't delete that customer.");
        return;
      }

      setCustomers((prev) => prev.filter((c) => c.id !== confirming.id));
      toast.success(
        `Erased ${data.deleted.customer} and ${data.deleted.tickets} ticket${
          data.deleted.tickets === 1 ? "" : "s"
        }.`,
      );
      setConfirming(null);
      setConfirmText("");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Customer data</h1>
        <p className="text-sm text-muted-foreground">
          Export or erase everything held about one customer, for GDPR and DPDP requests.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find a customer</CardTitle>
          <CardDescription>Search by name or email address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="rahul@northwind.test"
              aria-label="Search customers"
              className="pl-8"
            />
          </div>

          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : customers.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No customers found"
              description={search ? "Try a different search." : "Customers appear once they raise a ticket."}
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-border">
              {customers.map((customer) => (
                <li key={customer.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {customer.name ?? customer.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {customer.email} · {customer._count.tickets} ticket
                      {customer._count.tickets === 1 ? "" : "s"} · since{" "}
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/*
                    A download endpoint, not a page — an anchor lets the browser
                    honour Content-Disposition instead of navigating the app.
                  */}
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/workspace/data?email=${encodeURIComponent(customer.email)}`}>
                      <Download /> Export
                    </a>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Erase ${customer.email}`}
                    title="Erase all data"
                    onClick={() => {
                      setConfirming(customer);
                      setConfirmText("");
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Erase customer data"
        description="This cannot be undone."
      >
        {confirming && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                This permanently deletes <strong>{confirming.email}</strong> along with{" "}
                {confirming._count.tickets} ticket
                {confirming._count.tickets === 1 ? "" : "s"}, every message on them and their
                attachments.
              </p>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Type the email address to confirm
              </span>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirming.email}
                autoFocus
              />
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleting}
                disabled={confirmText !== confirming.email}
                onClick={() => void erase()}
              >
                <Trash2 /> Erase permanently
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
