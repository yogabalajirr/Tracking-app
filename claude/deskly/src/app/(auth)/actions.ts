"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  pruneExpiredSessions,
  verifyPasswordSafely,
} from "@/lib/auth";
import { provisionWorkspace } from "@/lib/workspace";
import { hashToken } from "@/lib/tokens";
import { acceptInviteSchema, loginSchema, signupSchema } from "@/lib/validation";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fromZod(err: ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors };
}

export async function signupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let ownerId: string;

  try {
    const input = signupSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      workspaceName: formData.get("workspaceName"),
      subdomain: formData.get("subdomain"),
      timezone: formData.get("timezone") || "Asia/Kolkata",
    });

    const [existingUser, existingWorkspace] = await Promise.all([
      prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      prisma.workspace.findUnique({
        where: { subdomain: input.subdomain },
        select: { id: true },
      }),
    ]);

    if (existingUser) {
      return {
        error: "That email is already registered.",
        fieldErrors: { email: "An account with this email already exists. Try signing in." },
      };
    }
    if (existingWorkspace) {
      return {
        error: "That subdomain is taken.",
        fieldErrors: { subdomain: "Someone already uses this subdomain. Pick another." },
      };
    }

    const { owner } = await provisionWorkspace({
      workspaceName: input.workspaceName,
      subdomain: input.subdomain,
      timezone: input.timezone,
      ownerName: input.name,
      ownerEmail: input.email,
      ownerPassword: input.password,
    });

    ownerId = owner.id;
  } catch (err) {
    if (err instanceof ZodError) return fromZod(err);
    console.error("[signup]", err);
    return { error: "We couldn't create your workspace. Please try again." };
  }

  await createSession(ownerId);
  redirect("/inbox?welcome=1");
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let userId: string;

  try {
    const input = loginSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true, isActive: true },
    });

    const ok = await verifyPasswordSafely(input.password, user?.passwordHash);

    // One message for both cases so the form cannot be used to enumerate accounts.
    if (!user || !ok) {
      return { error: "That email and password don't match an account." };
    }
    if (!user.isActive) {
      return { error: "This account has been deactivated. Ask an admin to re-enable it." };
    }

    userId = user.id;
  } catch (err) {
    if (err instanceof ZodError) return fromZod(err);
    console.error("[login]", err);
    return { error: "We couldn't sign you in. Please try again." };
  }

  await pruneExpiredSessions();
  await createSession(userId);
  redirect("/inbox");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function acceptInviteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let newUserId: string;

  try {
    const input = acceptInviteSchema.parse({
      token: formData.get("token"),
      name: formData.get("name"),
      password: formData.get("password"),
    });

    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return { error: "This invite link is no longer valid. Ask for a fresh one." };
    }

    const existing = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });
    if (existing) {
      return { error: "You already have an account — sign in instead." };
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          workspaceId: invite.workspaceId,
          email: invite.email,
          name: input.name,
          passwordHash,
          role: invite.role,
          teamId: invite.teamId,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    newUserId = user.id;
  } catch (err) {
    if (err instanceof ZodError) return fromZod(err);
    console.error("[accept-invite]", err);
    return { error: "We couldn't set up your account. Please try again." };
  }

  await createSession(newUserId);
  redirect("/inbox?welcome=1");
}
