import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";

export const Route = createFileRoute("/_protected/teams/")({
  component: TeamsIndex,
});

function TeamsIndex() {
  const { t } = useTranslation();
  const { teams } = Route.useRouteContext();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("teams.myTeams")}</h1>
        <Button asChild>
          <Link to="/teams/new">{t("teams.createTeam")}</Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("teams.noTeamsYet")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link
                    to="/teams/$teamId"
                    params={{ teamId: team.id }}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:text-primary"
                  >
                    <div>
                      <p className="font-medium">{team.name}</p>
                      {team.description ? <p className="text-xs text-muted-foreground">{team.description}</p> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {team.currentUserRole === "ADMIN" ? t("teams.roleAdmin") : t("teams.roleMember")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
