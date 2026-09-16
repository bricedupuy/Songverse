import { createFileRoute, Link } from "@tanstack/react-router";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/_protected/library/")({
  loader: async () => ({ versions: await apiClient.listSongVersions() }),
  component: LibraryIndex,
});

function artistLabel(artists: Array<{ userId: string | null; source: string | null }>): string | null {
  if (artists.length === 0) return null;
  return artists.map((a) => a.source ?? a.userId ?? "Unknown artist").join(", ");
}

function LibraryIndex() {
  const { versions } = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Button asChild>
          <Link to="/library/new">+ Add a song</Link>
        </Button>
      </div>

      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No songs yet. Add your first one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {versions.map((version) => (
            <Link key={version.id} to="/library/$songVersionId" params={{ songVersionId: version.id }}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="py-4">
                  <CardTitle className="flex items-baseline justify-between text-base font-medium">
                    <span>
                      {version.title}
                      {artistLabel(version.artists) ? (
                        <span className="ml-2 font-normal text-muted-foreground">— {artistLabel(version.artists)}</span>
                      ) : null}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">{version.language}</span>
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
