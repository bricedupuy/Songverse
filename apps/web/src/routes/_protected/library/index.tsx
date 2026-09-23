import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { useLibraryColumns } from "./-columns";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";

export const Route = createFileRoute("/_protected/library/")({
  loader: async () => ({ versions: await apiClient.listSongVersions() }),
  component: LibraryIndex,
});

function LibraryIndex() {
  const { t } = useTranslation();
  const { versions } = Route.useLoaderData();
  const navigate = useNavigate();
  const columns = useLibraryColumns();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("library.title")}</h1>
        <Button asChild>
          <Link to="/library/new">{t("library.addASong")}</Link>
        </Button>
      </div>

      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("library.noSongsYet")}
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0">
          <DataTable
            columns={columns}
            data={versions}
            filterPlaceholder={t("library.filterPlaceholder")}
            onRowClick={(version) => void navigate({ to: "/library/$songVersionId", params: { songVersionId: version.id } })}
          />
        </Card>
      )}
    </div>
  );
}
