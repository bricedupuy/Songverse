import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { apiClient } from "#/lib/api-client";
import { libraryColumns } from "./-columns";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";

export const Route = createFileRoute("/_protected/library/")({
  loader: async () => ({ versions: await apiClient.listSongVersions() }),
  component: LibraryIndex,
});

function LibraryIndex() {
  const { versions } = Route.useLoaderData();
  const navigate = useNavigate();

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
        <Card className="p-0">
          <DataTable
            columns={libraryColumns}
            data={versions}
            onRowClick={(version) => void navigate({ to: "/library/$songVersionId", params: { songVersionId: version.id } })}
          />
        </Card>
      )}
    </div>
  );
}
