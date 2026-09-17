import { SUPPORTED_LOCALES, type LocaleValue } from "@songverse/core";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ListMusic, Mic2, Music2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";

const LOCALE_NAMES: Record<LocaleValue, string> = { en: "English", fr: "Français" };

export const Route = createFileRoute("/_protected/dashboard")({
  loader: async ({ context }) => {
    const versions = await apiClient.listSongVersions();
    return { session: context.session, teams: context.teams, versions };
  },
  component: Dashboard,
});

function artistLabel(artists: { userId: string | null; source: string | null }[]): string | null {
  if (artists.length === 0) return null;
  return artists.map((a) => a.source ?? a.userId ?? "Unknown artist").join(", ");
}

function Dashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, teams, versions } = Route.useLoaderData();
  const recentVersions = versions.slice(0, 5);
  const distinctArtists = new Set(
    versions.flatMap((v) => v.artists.map((a) => a.source ?? a.userId).filter((a): a is string => Boolean(a))),
  );
  const [savingLocale, setSavingLocale] = useState(false);

  async function changeLocale(locale: LocaleValue) {
    setSavingLocale(true);
    try {
      await apiClient.updateMe({ locale });
      await router.invalidate();
    } finally {
      setSavingLocale(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("dashboard.welcomeBack", { name: session.displayName })}</h1>
        <p className="text-sm text-muted-foreground">{session.email}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Music2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{versions.length}</p>
              <p className="text-sm text-muted-foreground">{t("dashboard.songs")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mic2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{distinctArtists.size}</p>
              <p className="text-sm text-muted-foreground">{t("dashboard.artists")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{teams.length}</p>
              <p className="text-sm text-muted-foreground">{t("dashboard.teams")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">{t("dashboard.recentlyUpdated")}</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/library">{t("dashboard.viewAll")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentVersions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
              <ListMusic className="size-8" />
              <p>{t("dashboard.noSongsYet")}</p>
              <Button asChild size="sm">
                <Link to="/library/new">{t("dashboard.addASong")}</Link>
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col divide-y">
              {recentVersions.map((version) => (
                <li key={version.id}>
                  <Link
                    to="/library/$songVersionId"
                    params={{ songVersionId: version.id }}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:text-primary"
                  >
                    <div>
                      <p className="font-medium">{version.title}</p>
                      {artistLabel(version.artists) ? (
                        <p className="text-sm text-muted-foreground">{artistLabel(version.artists)}</p>
                      ) : null}
                    </div>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {new Date(version.updatedAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">{t("dashboard.teams")}</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/teams/new">{t("teams.createTeam")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.noTeamsYet")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link
                    to="/teams/$teamId"
                    params={{ teamId: team.id }}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:text-primary"
                  >
                    <span className="font-medium">{team.name}</span>
                    <span className="text-xs text-muted-foreground">{team.slug}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("dashboard.language")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <Label htmlFor="locale">{t("dashboard.languageDescription")}</Label>
          <select
            id="locale"
            value={session.locale}
            disabled={savingLocale}
            onChange={(e) => void changeLocale(e.target.value as LocaleValue)}
            className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>
    </div>
  );
}
