import { createFileRoute, Link } from "@tanstack/react-router";
import { ListMusic, Mic2, Music2, Users } from "lucide-react";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/_protected/dashboard")({
  loader: async ({ context }) => {
    const [teams, versions] = await Promise.all([apiClient.listTeams(), apiClient.listSongVersions()]);
    return { session: context.session, teams, versions };
  },
  component: Dashboard,
});

function artistLabel(artists: { userId: string | null; source: string | null }[]): string | null {
  if (artists.length === 0) return null;
  return artists.map((a) => a.source ?? a.userId ?? "Unknown artist").join(", ");
}

function Dashboard() {
  const { session, teams, versions } = Route.useLoaderData();
  const recentVersions = versions.slice(0, 5);
  const distinctArtists = new Set(
    versions.flatMap((v) => v.artists.map((a) => a.source ?? a.userId).filter((a): a is string => Boolean(a))),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {session.displayName}</h1>
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
              <p className="text-sm text-muted-foreground">Songs</p>
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
              <p className="text-sm text-muted-foreground">Artists</p>
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
              <p className="text-sm text-muted-foreground">Teams</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Recently updated</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/library">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentVersions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
              <ListMusic className="size-8" />
              <p>No songs yet. Add your first one to get started.</p>
              <Button asChild size="sm">
                <Link to="/library/new">+ Add a song</Link>
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
        <CardHeader>
          <CardTitle className="text-sm">Teams</CardTitle>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">You're not part of any teams yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {teams.map((team) => (
                <li key={team.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="font-medium">{team.name}</span>
                  <span className="text-xs text-muted-foreground">{team.slug}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
