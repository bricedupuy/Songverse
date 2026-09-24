import type { SongSort } from "@songverse/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { useLibraryColumns } from "./-columns";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { Input } from "#/components/ui/input";

const PAGE_SIZE = 50;
const SORTS: SongSort[] = ["title", "updatedAt", "createdAt", "language", "publicationState"];

export interface LibrarySearch {
  q?: string;
  page?: number;
  sort?: SongSort;
  dir?: "asc" | "desc";
}

export const Route = createFileRoute("/_protected/library/")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const page = Number(search.page);
    return {
      ...(typeof search.q === "string" && search.q.trim() && { q: search.q }),
      ...(Number.isInteger(page) && page > 1 && { page }),
      ...(typeof search.sort === "string" && (SORTS as string[]).includes(search.sort) && { sort: search.sort as SongSort }),
      ...((search.dir === "asc" || search.dir === "desc") && { dir: search.dir }),
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({ songs: await apiClient.listSongVersions({ ...deps, pageSize: PAGE_SIZE }) }),
  component: LibraryIndex,
});

function LibraryIndex() {
  const { t } = useTranslation();
  const { songs } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const columns = useLibraryColumns();
  const [query, setQuery] = useState(search.q ?? "");

  // Search as you type, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q === (search.q ?? "")) return;
    const timer = setTimeout(() => {
      void navigate({ search: (prev) => ({ ...prev, q: q || undefined, page: undefined }), replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search.q, navigate]);

  const sort = search.sort ?? "updatedAt";
  const desc = (search.dir ?? (sort === "updatedAt" || sort === "createdAt" ? "desc" : "asc")) === "desc";
  const from = songs.total === 0 ? 0 : (songs.page - 1) * songs.pageSize + 1;
  const to = Math.min(songs.page * songs.pageSize, songs.total);
  const lastPage = Math.max(1, Math.ceil(songs.total / songs.pageSize));
  const goToPage = (page: number) => void navigate({ search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }) });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("library.title")}</h1>
        <Button asChild>
          <Link to="/library/new">{t("library.addASong")}</Link>
        </Button>
      </div>

      {songs.total === 0 && !search.q ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("library.noSongsYet")}</CardContent>
        </Card>
      ) : (
        <Card className="gap-0 p-0">
          <div className="px-4 pt-4 pb-3">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("library.searchPlaceholder")}
                aria-label={t("library.searchPlaceholder")}
                className="pl-9"
              />
            </div>
          </div>
          <DataTable
            columns={columns}
            data={songs.items}
            emptyMessage={t("library.noMatches")}
            sorting={[{ id: sort, desc }]}
            onSortingChange={(next) => {
              const first = next[0];
              void navigate({
                search: (prev) => ({
                  ...prev,
                  sort: first && (SORTS as string[]).includes(first.id) ? (first.id as SongSort) : undefined,
                  dir: first ? (first.desc ? "desc" : "asc") : undefined,
                  page: undefined,
                }),
              });
            }}
            onRowClick={(version) => void navigate({ to: "/library/$songVersionId", params: { songVersionId: version.id } })}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span data-testid="library-range">{t("library.range", { from, to, total: songs.total })}</span>
            {lastPage > 1 ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={songs.page <= 1} onClick={() => goToPage(songs.page - 1)}>
                  {t("library.previous")}
                </Button>
                <span>{t("library.pageOf", { page: songs.page, pages: lastPage })}</span>
                <Button variant="outline" size="sm" disabled={songs.page >= lastPage} onClick={() => goToPage(songs.page + 1)}>
                  {t("library.next")}
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
