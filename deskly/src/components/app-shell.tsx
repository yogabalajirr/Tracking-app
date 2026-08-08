"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Headset,
  Inbox,
  Keyboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { Avatar, Badge, Separator } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";
import { NotificationBell } from "@/components/notification-bell";
import { ShortcutHelp, ShortcutProvider } from "@/components/shortcuts";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";

const NAV = [
  { href: "/inbox", label: "Inbox", icon: Inbox, permission: "tickets.read" as const },
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "reports.read" as const },
  { href: "/settings", label: "Settings", icon: Settings, permission: "workspace.read" as const },
];

export function AppShell({
  user,
  aiEnabled,
  children,
}: {
  user: SessionUser;
  aiEnabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  // Close the mobile drawer whenever the route changes. Adjusted during
  // render rather than in an effect, so the drawer never paints open on the
  // new route for a frame.
  const [drawerPath, setDrawerPath] = React.useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setMobileOpen(false);
  }

  const links = NAV.filter((item) => can(user.role, item.permission));

  return (
    <ShortcutProvider onShowHelp={() => setHelpOpen(true)}>
      <div className="flex h-dvh flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>

          <Link href="/inbox" className="flex items-center gap-2 font-semibold">
            <span
              className="grid size-7 place-items-center rounded-md text-primary-foreground"
              style={{ backgroundColor: user.workspace.brandColor ?? undefined }}
            >
              <Headset className="size-4" />
            </span>
            <span className="hidden sm:inline">{user.workspace.name}</span>
          </Link>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {aiEnabled && (
              <Badge variant="default" className="hidden lg:inline-flex" title="Claude features are enabled">
                <Sparkles className="size-3" />
                AI on
              </Badge>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (press ?)"
              onClick={() => setHelpOpen(true)}
            >
              <Keyboard />
            </Button>

            <NotificationBell />
            <ThemeToggle className="hidden sm:inline-flex" />

            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

            <div className="flex items-center gap-2">
              <Avatar name={user.name} src={user.avatarUrl} seed={user.id} size={28} />
              <div className="hidden leading-tight lg:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <form action={logoutAction}>
              <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out" title="Sign out">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>

        {mobileOpen && (
          <nav aria-label="Main" className="border-b border-border p-2 md:hidden">
            {links.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} block />
            ))}
            <div className="flex items-center justify-between px-2 pt-2">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          </nav>
        )}

        <main id="main" className="min-h-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </ShortcutProvider>
  );
}


function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
  block,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pathname: string;
  block?: boolean;
}) {
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        block && "w-full",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
