"use client";

import * as React from "react";
import { Check, Copy, Mail, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Separator,
} from "@/components/ui/primitives";
import { assignableRoles, can, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  avatarUrl: string | null;
  team: { id: string; name: string } | null;
};

type Invite = { id: string; email: string; role: Role; expiresAt: string };
type Team = { id: string; name: string; _count: { members: number } };

export function MembersSettings({
  currentUser,
  initialMembers,
  initialInvites,
  initialTeams,
}: {
  currentUser: { id: string; role: Role };
  initialMembers: Member[];
  initialInvites: Invite[];
  initialTeams: Team[];
}) {
  const [members, setMembers] = React.useState(initialMembers);
  const [invites, setInvites] = React.useState(initialInvites);
  const [teams, setTeams] = React.useState(initialTeams);

  const [inviting, setInviting] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [newTeam, setNewTeam] = React.useState("");

  const manage = can(currentUser.role, "workspace.members");
  const roles = assignableRoles(currentUser.role);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setInviting(true);
    setInviteLink(null);

    try {
      const res = await fetch("/api/workspace/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          role: form.get("role"),
          teamId: form.get("teamId") || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't send that invite.");
        return;
      }

      setInvites((prev) => [data.invite, ...prev.filter((i) => i.email !== data.invite.email)]);
      setInviteLink(data.inviteUrl);
      (e.target as HTMLFormElement).reset();

      toast.success(
        data.emailed
          ? `Invite sent to ${data.invite.email}.`
          : "Invite created — email isn't configured, so share the link below.",
      );
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setInviting(false);
    }
  }

  async function changeMember(id: string, patch: Record<string, unknown>) {
    const previous = members;
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

    const res = await fetch(`/api/workspace/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();

    if (!res.ok) {
      setMembers(previous);
      toast.error(data.error ?? "Couldn't update that member.");
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...data.member } : m)));
  }

  async function deactivate(id: string) {
    const res = await fetch(`/api/workspace/members/${id}`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error ?? "Couldn't deactivate that member.");
      return;
    }

    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, isActive: false } : m)));
    toast.success(
      data.unassignedTickets > 0
        ? `Deactivated — ${data.unassignedTickets} open ticket${data.unassignedTickets === 1 ? "" : "s"} returned to the queue.`
        : "Member deactivated.",
    );
  }

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeam.trim()) return;

    const res = await fetch("/api/workspace/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeam.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error ?? "Couldn't create that team.");
      return;
    }

    setTeams((prev) => [...prev, { ...data.team, _count: { members: 0 } }]);
    setNewTeam("");
    toast.success(`Team "${data.team.name}" created.`);
  }

  async function removeTeam(id: string) {
    const res = await fetch(`/api/workspace/teams/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Couldn't delete that team.");
      return;
    }
    setTeams((prev) => prev.filter((t) => t.id !== id));
    setMembers((prev) => prev.map((m) => (m.team?.id === id ? { ...m, team: null } : m)));
    toast.success("Team deleted.");
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Members &amp; teams</h1>
        <p className="text-sm text-muted-foreground">
          Invite agents, set what they can do, and group them into teams for routing.
        </p>
      </div>

      {manage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4" /> Invite a teammate
            </CardTitle>
            <CardDescription>
              They&apos;ll get a magic link that&apos;s valid for 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={invite} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Email" htmlFor="invite-email" required className="sm:col-span-1">
                  <Input name="email" type="email" required placeholder="agent@agentsupport.com" />
                </Field>

                <Field label="Role" htmlFor="invite-role">
                  <select
                    name="role"
                    defaultValue="AGENT"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Team" htmlFor="invite-team">
                  <select
                    name="teamId"
                    defaultValue=""
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">None</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Button type="submit" loading={inviting}>
                <Mail /> Send invite
              </Button>
            </form>

            {inviteLink && (
              <div className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium">Invite link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                    {inviteLink}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyLink}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 text-muted-foreground" />
                  <span>{i.email}</span>
                  <Badge variant="muted">{ROLE_LABELS[i.role]}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    expires {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members ({members.filter((m) => m.isActive).length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center gap-3">
              <Avatar name={member.name} src={member.avatarUrl} seed={member.id} size={32} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.id === currentUser.id && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                  {!member.isActive && (
                    <Badge variant="muted" className="ml-2">
                      Deactivated
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>

              {member.role === "OWNER" || !manage ? (
                <Badge variant="secondary" title={ROLE_DESCRIPTIONS[member.role]}>
                  {ROLE_LABELS[member.role]}
                </Badge>
              ) : (
                <select
                  value={member.role}
                  aria-label={`Role for ${member.name}`}
                  onChange={(e) => void changeMember(member.id, { role: e.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              )}

              {manage && member.role !== "OWNER" ? (
                <select
                  value={member.team?.id ?? ""}
                  aria-label={`Team for ${member.name}`}
                  onChange={(e) =>
                    void changeMember(member.id, { teamId: e.target.value || null })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">No team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                member.team && <Badge variant="outline">{member.team.name}</Badge>
              )}

              {manage && member.role !== "OWNER" && member.id !== currentUser.id && member.isActive && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Deactivate ${member.name}`}
                  title="Deactivate"
                  onClick={() => void deactivate(member.id)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" /> Teams
          </CardTitle>
          <CardDescription>
            Routing rules can target a team; tickets are then handed out round-robin to whoever
            has the lightest queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {teams.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No teams yet"
              description="Create one to route tickets by speciality."
              className="py-6"
            />
          ) : (
            <ul className="space-y-2">
              {teams.map((team) => (
                <li key={team.id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{team.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {team._count.members} member{team._count.members === 1 ? "" : "s"}
                  </span>
                  {can(currentUser.role, "workspace.manage") && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      aria-label={`Delete team ${team.name}`}
                      onClick={() => void removeTeam(team.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {can(currentUser.role, "workspace.manage") && (
            <>
              <Separator />
              <form onSubmit={addTeam} className="flex gap-2">
                <Input
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  placeholder="New team name"
                  aria-label="New team name"
                  className="max-w-xs"
                />
                <Button type="submit" variant="outline" disabled={!newTeam.trim()}>
                  <Plus /> Add team
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
