"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, DatabaseZap, Timer, Users, Workflow, Zap } from "lucide-react";
import { can, type Permission } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ITEMS: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
}[] = [
  { href: "/settings", label: "Workspace", icon: Building2, permission: "workspace.read" },
  { href: "/settings/members", label: "Members & teams", icon: Users, permission: "workspace.read" },
  { href: "/settings/sla", label: "SLA policies", icon: Timer, permission: "workspace.read" },
  { href: "/settings/rules", label: "Routing rules", icon: Workflow, permission: "workspace.read" },
  { href: "/settings/macros", label: "Canned responses", icon: Zap, permission: "tickets.read" },
  { href: "/settings/data", label: "Customer data", icon: DatabaseZap, permission: "workspace.manage" },
];

export function SettingsNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => can(role, item.permission));

  return (
    <nav
      aria-label="Settings"
      className="w-48 shrink-0 overflow-y-auto border-r border-border p-2 scroll-slim sm:w-56"
    >
      <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Settings
      </p>
      <ul className="space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
