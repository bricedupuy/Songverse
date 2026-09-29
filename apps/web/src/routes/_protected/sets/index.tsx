import type { SetlistSummary } from "@songverse/core";
import type { ColumnDef } from "@tanstack/react-table";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { apiClient } from "#/lib/api-client";
import { formatSetDate, setOwnerLabel, setlistTitle } from "#/lib/setlists";

export const Route = createFileRoute("/_protected/sets/")({
  loader: () => apiClient.listSetlists(),
  component: SetsIndex,
});

function SetsIndex() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setlists = Route.useLoaderData();

  const columns = useMemo<ColumnDef<SetlistSummary>[]>(
    () => [
      {
        id: "title",
        accessorFn: (set) => setlistTitle(set, t, i18n.language),
        header: t("sets.columnSet"),
        cell: ({ row, getValue }) => (
          <span className="flex items-center gap-2 font-medium">
            {getValue<string>()}
            {row.original.isGuest ? <Badge variant="muted">{t("sets.guestBadge")}</Badge> : null}
          </span>
        ),
      },
      {
        id: "date",
        accessorFn: (set) => (set.eventDate ? formatSetDate(set.eventDate, i18n.language) : t("sets.noDate")),
        header: t("sets.columnDate"),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        id: "owner",
        accessorFn: (set) => setOwnerLabel(set, t),
        header: t("sets.columnOwner"),
        meta: { secondary: true },
      },
      {
        accessorKey: "itemCount",
        header: t("sets.columnSongs"),
      },
    ],
    [t, i18n.language],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("sets.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sets.description")}</p>
        </div>
        <Button render={<Link to="/sets/new" />}>{t("sets.newSet")}</Button>
      </div>

      {setlists.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("sets.noSetsYet")}</CardContent>
        </Card>
      ) : (
        <Card className="p-0">
          <DataTable
            columns={columns}
            data={setlists}
            onRowClick={(set) => void navigate({ to: "/sets/$setlistId", params: { setlistId: set.id } })}
          />
        </Card>
      )}
    </div>
  );
}
