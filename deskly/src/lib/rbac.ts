import type { Role } from "@/generated/prisma/enums";

/**
 * Capability-based permissions. Route handlers ask `can(role, "tickets.write")`
 * rather than comparing role strings, so adding a role later touches only this
 * file.
 */
export type Permission =
  | "tickets.read"
  | "tickets.write"
  | "tickets.delete"
  | "reports.read"
  | "workspace.read"
  | "workspace.manage"
  | "workspace.members"
  | "workspace.delete";

const MATRIX: Record<Role, Permission[]> = {
  OWNER: [
    "tickets.read",
    "tickets.write",
    "tickets.delete",
    "reports.read",
    "workspace.read",
    "workspace.manage",
    "workspace.members",
    "workspace.delete",
  ],
  ADMIN: [
    "tickets.read",
    "tickets.write",
    "tickets.delete",
    "reports.read",
    "workspace.read",
    "workspace.manage",
    "workspace.members",
  ],
  AGENT: ["tickets.read", "tickets.write", "reports.read", "workspace.read"],
  VIEWER: ["tickets.read", "reports.read", "workspace.read"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  AGENT: "Agent",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Full access, including deleting the workspace.",
  ADMIN: "Manage settings, members, SLAs and routing rules.",
  AGENT: "Work tickets: reply, assign, tag, resolve.",
  VIEWER: "Read-only access to tickets and reports.",
};

/** Roles an existing member is allowed to hand out when inviting. */
export function assignableRoles(role: Role): Role[] {
  if (role === "OWNER") return ["ADMIN", "AGENT", "VIEWER"];
  if (role === "ADMIN") return ["AGENT", "VIEWER"];
  return [];
}
