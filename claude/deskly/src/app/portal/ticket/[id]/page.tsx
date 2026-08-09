import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { prisma, tenantDb } from "@/lib/db";
import { verifyPortalToken } from "@/lib/tokens";
import { PortalTicket } from "@/components/portal/portal-ticket";

export const metadata: Metadata = {
  title: "Your support ticket",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

/**
 * Public ticket view. No account, no session — access is proved entirely by
 * the signed token in the URL, which is checked against this exact ticket id.
 */
export default async function PortalTicketPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { token } = await searchParams;

  if (!token || !verifyPortalToken(token, id)) {
    return <InvalidLink />;
  }

  // The token proves which ticket, so the workspace is looked up from it.
  const base = await prisma.ticket.findUnique({
    where: { id },
    select: { workspaceId: true },
  });
  if (!base) return <InvalidLink />;

  const db = tenantDb(base.workspaceId);

  const [ticket, workspace] = await Promise.all([
    db.ticket.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, email: true } },
        // Internal notes must never reach this page.
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          include: {
            attachments: {
              select: { id: true, url: true, filename: true, mimeType: true, size: true },
            },
          },
        },
      },
    }),
    prisma.workspace.findUniqueOrThrow({
      where: { id: base.workspaceId },
      select: { name: true, brandColor: true, logoUrl: true },
    }),
  ]);

  if (!ticket) return <InvalidLink />;

  return (
    <PortalTicket
      workspace={workspace}
      token={token}
      ticket={{
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
        customerName: ticket.customer.name,
        messages: ticket.messages.map((m) => ({
          id: m.id,
          authorType: m.authorType,
          authorName: m.authorName,
          body: m.body,
          bodyHtml: m.bodyHtml,
          createdAt: m.createdAt.toISOString(),
          attachments: m.attachments,
        })),
      }}
    />
  );
}

function InvalidLink() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">This link isn&apos;t valid</h1>
        <p className="text-sm text-muted-foreground">
          It may have expired, or been copied incompletely. Check the most recent email we
          sent you, or reply to that email and we&apos;ll pick it up from there.
        </p>
      </div>
    </main>
  );
}
