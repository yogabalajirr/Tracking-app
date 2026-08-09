import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/primitives";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept your invite" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { name: true } } },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">This invite isn&apos;t valid</h1>
        <p className="text-sm text-muted-foreground">
          {invite?.acceptedAt
            ? "It has already been used. Try signing in instead."
            : "It may have expired. Ask an admin on the team to send a fresh one."}
        </p>
        <Link href="/login" className="inline-block text-sm font-medium text-primary hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Join {invite.workspace.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been invited as {ROLE_LABELS[invite.role].toLowerCase()} —{" "}
          {ROLE_DESCRIPTIONS[invite.role].toLowerCase()}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <AcceptInviteForm token={token} email={invite.email} />
        </CardContent>
      </Card>
    </div>
  );
}
