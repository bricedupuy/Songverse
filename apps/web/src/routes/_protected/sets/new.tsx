import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { apiClient } from "#/lib/api-client";
import { formatSetDate, todayIso } from "#/lib/setlists";

export const Route = createFileRoute("/_protected/sets/new")({
  component: NewSet,
});

function NewSet() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const { teams } = Route.useRouteContext();
  const adminTeams = teams.filter((team) => team.currentUserRole === "ADMIN");

  const [eventDate, setEventDate] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const set = await apiClient.createSetlist({
        name: name.trim() || undefined,
        eventDate: eventDate || undefined,
        teamId: owner || undefined,
      });
      await router.invalidate();
      await navigate({ to: "/sets/$setlistId", params: { setlistId: set.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("sets.newSet")}</h1>
      <Card>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="set-date">{t("sets.dateLabel")}</Label>
              <Input id="set-date" type="date" min={todayIso()} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="set-name">{t("sets.nameLabel")}</Label>
              <Input
                id="set-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder={eventDate ? formatSetDate(eventDate, i18n.language, "long") : t("sets.untitled")}
              />
              <p className="text-xs text-muted-foreground">{t("sets.dateHint")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="set-owner">{t("sets.ownerLabel")}</Label>
              <select
                id="set-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="">{t("sets.ownerPersonal")}</option>
                {adminTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              {teams.length > adminTeams.length ? <p className="text-xs text-muted-foreground">{t("sets.ownerTeamHint")}</p> : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? t("sets.creating") : t("sets.create")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
