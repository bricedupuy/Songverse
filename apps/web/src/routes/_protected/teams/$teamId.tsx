import type { TeamRole } from "@songverse/core";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/_protected/teams/$teamId")({
  loader: async ({ context, params }) => {
    const team = await apiClient.getTeam(params.teamId).catch(() => null);
    if (!team) throw redirect({ to: "/dashboard" });

    const members = await apiClient.listTeamMembers(params.teamId);
    const inviteLinks = team.currentUserRole === "ADMIN" ? await apiClient.listTeamInviteLinks(params.teamId) : [];
    return { session: context.session, team, members, inviteLinks };
  },
  component: TeamDetail,
});

function TeamDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, team, members, inviteLinks } = Route.useLoaderData();
  const isAdmin = team.currentUserRole === "ADMIN";

  const isSoleMember = members.length === 1;
  const isSoleAdmin = isAdmin && members.filter((m) => m.role === "ADMIN").length === 1;
  const otherMembers = members.filter((m) => m.userId !== session.userId);

  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [promotingBeforeLeave, setPromotingBeforeLeave] = useState(false);
  const [promoteTargetUserId, setPromoteTargetUserId] = useState("");

  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [linkRole, setLinkRole] = useState<TeamRole>("MEMBER");
  const [linkExpiresInDays, setLinkExpiresInDays] = useState("");
  const [linkMaxUses, setLinkMaxUses] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  async function refresh() {
    await router.invalidate();
  }

  async function changeRole(userId: string, role: TeamRole) {
    setBusyUserId(userId);
    setError(null);
    try {
      await apiClient.updateTeamMemberRole(team.id, userId, role);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(userId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      await apiClient.removeTeamMember(team.id, userId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteTeam() {
    setDeleting(true);
    try {
      await apiClient.deleteTeam(team.id);
      window.location.href = "/teams";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function leaveTeam() {
    setLeaving(true);
    setError(null);
    try {
      await apiClient.leaveTeam(team.id);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLeaving(false);
      setConfirmingLeave(false);
    }
  }

  async function promoteAndLeave() {
    if (!promoteTargetUserId) return;
    setLeaving(true);
    setError(null);
    try {
      await apiClient.updateTeamMemberRole(team.id, promoteTargetUserId, "ADMIN");
      await apiClient.leaveTeam(team.id);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLeaving(false);
    }
  }

  async function createInviteLink() {
    setCreatingLink(true);
    setError(null);
    try {
      await apiClient.createTeamInviteLink(team.id, {
        role: linkRole,
        expiresInDays: linkExpiresInDays ? Number(linkExpiresInDays) : undefined,
        maxUses: linkMaxUses ? Number(linkMaxUses) : undefined,
      });
      setLinkExpiresInDays("");
      setLinkMaxUses("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingLink(false);
    }
  }

  async function revokeLink(linkId: string) {
    setBusyLinkId(linkId);
    setError(null);
    try {
      await apiClient.revokeTeamInviteLink(team.id, linkId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLinkId(null);
    }
  }

  function inviteUrl(token: string): string {
    return `${window.location.origin}/join/${token}`;
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(inviteUrl(token));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{team.name}</h1>
          {team.description ? <p className="text-sm text-muted-foreground">{team.description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={() => void deleteTeam()} disabled={deleting}>
                  {deleting ? t("teams.deletingTeam") : t("teams.confirmDeleteTeam")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                  {t("teams.cancel")}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
                {t("teams.deleteTeam")}
              </Button>
            )
          ) : null}
          {isSoleMember ? null : isSoleAdmin ? (
            promotingBeforeLeave ? (
              <div className="flex items-center gap-2">
                <select
                  value={promoteTargetUserId}
                  onChange={(e) => setPromoteTargetUserId(e.target.value)}
                  disabled={leaving}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  <option value="">{t("teams.chooseMember")}</option>
                  {otherMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void promoteAndLeave()}
                  disabled={!promoteTargetUserId || leaving}
                >
                  {leaving ? t("teams.leaving") : t("teams.promoteAndLeave")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPromotingBeforeLeave(false)} disabled={leaving}>
                  {t("teams.cancel")}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setPromotingBeforeLeave(true)}>
                {t("teams.leaveTeam")}
              </Button>
            )
          ) : confirmingLeave ? (
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" onClick={() => void leaveTeam()} disabled={leaving}>
                {leaving ? t("teams.leaving") : t("teams.confirmLeave")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingLeave(false)} disabled={leaving}>
                {t("teams.cancel")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmingLeave(true)}>
              {t("teams.leaveTeam")}
            </Button>
          )}
        </div>
      </div>
      {promotingBeforeLeave ? (
        <p className="text-sm text-muted-foreground">{t("teams.promoteBeforeLeaveDescription")}</p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("teams.members")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {members.map((member) => {
              const isSelf = member.userId === session.userId;
              return (
                <li key={member.userId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">
                      {member.displayName}
                      {isSelf ? ` (${t("teams.you")})` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && !isSelf ? (
                      <select
                        value={member.role}
                        disabled={busyUserId === member.userId}
                        onChange={(e) => void changeRole(member.userId, e.target.value as TeamRole)}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                      >
                        <option value="MEMBER">{t("teams.roleMember")}</option>
                        <option value="ADMIN">{t("teams.roleAdmin")}</option>
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {member.role === "ADMIN" ? t("teams.roleAdmin") : t("teams.roleMember")}
                      </span>
                    )}
                    {isAdmin && !isSelf ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeMember(member.userId)}
                        disabled={busyUserId === member.userId}
                      >
                        {t("teams.remove")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("teams.inviteLinks")}</CardTitle>
            <CardDescription>{t("teams.inviteLinksDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="link-role">{t("teams.roleForInvite")}</Label>
                <select
                  id="link-role"
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value as TeamRole)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <option value="MEMBER">{t("teams.roleMember")}</option>
                  <option value="ADMIN">{t("teams.roleAdmin")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="link-expires">{t("teams.expiresInDays")}</Label>
                <Input
                  id="link-expires"
                  type="number"
                  min={1}
                  max={365}
                  value={linkExpiresInDays}
                  onChange={(e) => setLinkExpiresInDays(e.target.value)}
                  placeholder={t("teams.never")}
                  className="w-28"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="link-max-uses">{t("teams.maxUses")}</Label>
                <Input
                  id="link-max-uses"
                  type="number"
                  min={1}
                  value={linkMaxUses}
                  onChange={(e) => setLinkMaxUses(e.target.value)}
                  placeholder={t("teams.unlimited")}
                  className="w-28"
                />
              </div>
              <Button onClick={() => void createInviteLink()} disabled={creatingLink}>
                {creatingLink ? t("teams.creatingLink") : t("teams.createInviteLink")}
              </Button>
            </div>

            {inviteLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("teams.noInviteLinksYet")}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {inviteLinks.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">{inviteUrl(link.token)}</p>
                      <p className="text-xs text-muted-foreground">
                        {link.role === "ADMIN" ? t("teams.roleAdmin") : t("teams.roleMember")} ·{" "}
                        {link.usedCount}
                        {link.maxUses !== null ? `/${link.maxUses}` : ""} {t("teams.uses")}
                        {link.expiresAt
                          ? ` · ${t("teams.expires")} ${new Date(link.expiresAt).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void copyLink(link.token)}>
                        {t("teams.copyLink")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void revokeLink(link.id)}
                        disabled={busyLinkId === link.id}
                      >
                        {t("teams.revoke")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
