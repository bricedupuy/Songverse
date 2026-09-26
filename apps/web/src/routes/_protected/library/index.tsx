import { resolveTranslation, type LocaleValue, type SmartListFilters, type SongSort, type Tag } from "@songverse/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ListFilter, Search, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { LibraryShelves } from "#/components/library-home";
import { useLibraryColumns } from "./-columns";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { Input } from "#/components/ui/input";
import { ConfirmButton } from "#/components/confirm-button";
import { LanguageSelect } from "#/components/language-select";
import { NativeSelect } from "#/components/ui/native-select";
import { refreshSmartLists, useSmartLists } from "#/lib/smart-lists";

const PAGE_SIZE = 50;
const SORTS: SongSort[] = ["title", "updatedAt", "createdAt", "language", "publicationState"];

export interface LibrarySearch {
  q?: string;
  language?: string;
  tagId?: string;
  /** An artist's songs (issue #58): the whole name. */
  artist?: string;
  /** The smart list being looked at, if any (its filters are the rest of the search). */
  list?: string;
  /** Only the user's favorites (issue #81). */
  favorites?: boolean;
  page?: number;
  sort?: SongSort;
  dir?: "asc" | "desc";
}

// The router reads "?q=12345" (a CCLI number, say) as a number: as text it's the same search.
const text = (value: unknown): string | undefined => {
  const written = typeof value === "number" ? String(value) : value;
  return typeof written === "string" && written.trim() ? written : undefined;
};

/** A search's filters, as a smart list keeps them. */
function filtersOf(search: LibrarySearch): SmartListFilters {
  const { q, language, tagId, artist, sort, dir } = search;
  return Object.fromEntries(Object.entries({ q, language, tagId, artist, sort, dir }).filter(([, value]) => value !== undefined)) as SmartListFilters;
}

const sameFilters = (a: SmartListFilters, b: SmartListFilters) => JSON.stringify(filtersOf(a)) === JSON.stringify(filtersOf(b));

export const Route = createFileRoute("/_protected/library/")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const page = Number(search.page);
    const [q, language, tagId, artist, list] = [search.q, search.language, search.tagId, search.artist, search.list].map(text);
    return {
      ...(q && { q }),
      ...(language && { language }),
      ...(tagId && { tagId }),
      ...(artist && { artist }),
      ...(list && { list }),
      ...((search.favorites === true || search.favorites === "true") && { favorites: true }),
      ...(Number.isInteger(page) && page > 1 && { page }),
      ...(typeof search.sort === "string" && (SORTS as string[]).includes(search.sort) && { sort: search.sort as SongSort }),
      ...((search.dir === "asc" || search.dir === "desc") && { dir: search.dir }),
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    // `list` only names the page; the filters are the rest.
    const query = { ...filtersOf(deps), favorites: deps.favorites, page: deps.page };
    // The home's shelves (issue #81) come first when nothing is searched or filtered.
    const atHome = Object.keys(filtersOf(deps)).length === 0 && !deps.list && !deps.favorites && !deps.page;
    const [songs, tags, home] = await Promise.all([
      apiClient.listSongVersions({ ...query, pageSize: PAGE_SIZE }),
      apiClient.listTags().catch(() => [] as Tag[]),
      atHome ? apiClient.getLibraryHome().catch(() => null) : null,
    ]);
    return { songs, tags, home };
  },
  component: LibraryIndex,
});

function LibraryIndex() {
  const { t, i18n } = useTranslation();
  const { songs, tags, home } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { session } = Route.useRouteContext();
  const columns = useLibraryColumns(session.userId);
  const [query, setQuery] = useState(search.q ?? "");
  // Following the address (a smart list opened from the sidebar, say).
  useEffect(() => setQuery(search.q ?? ""), [search.q]);

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
  const lists = useSmartLists();
  const list = search.list ? lists.find((candidate) => candidate.id === search.list) : undefined;
  const filtered = Object.keys(filtersOf({ ...search, sort: undefined, dir: undefined })).length > 0 || !!search.favorites;
  const setFilter = (change: Partial<LibrarySearch>) => void navigate({ search: (prev) => ({ ...prev, ...change, page: undefined }) });
  const goToPage = (page: number) => void navigate({ search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }) });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {list ? <ListFilter className="size-5 text-muted-foreground" aria-hidden /> : null}
          {list?.name ?? t("library.title")}
        </h1>
        <Button asChild>
          <Link to="/library/new">{t("library.addASong")}</Link>
        </Button>
      </div>

      {home ? <LibraryShelves home={home} /> : null}
      {home && (home.newest.length > 0 || home.recent.length > 0) ? <h2 className="-mb-3 text-lg font-semibold">{t("library.home.allSongs")}</h2> : null}

      <SmartListBar search={search} filtered={filtered} />

      {songs.total === 0 && !filtered ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("library.noSongsYet")}</CardContent>
        </Card>
      ) : (
        <Card className="gap-0 p-0">
          <div className="px-4 pt-4 pb-3">
            <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
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
            <LanguageSelect
              value={search.language ?? ""}
              onChange={(language) => setFilter({ language: language || undefined })}
              allowEmpty
              emptyLabel={t("library.allLanguages")}
              className="w-auto"
            />
            <NativeSelect value={search.tagId ?? ""} onChange={(event) => setFilter({ tagId: event.target.value || undefined })} aria-label={t("library.filterTag")}>
              <option value="">{t("library.allTags")}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {resolveTranslation(tag.label, tag.translations, i18n.language as LocaleValue)}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant={search.favorites ? "default" : "outline"}
              aria-pressed={!!search.favorites}
              onClick={() => setFilter({ favorites: search.favorites ? undefined : true })}
            >
              <Star className={search.favorites ? "fill-current" : undefined} />
              {t("library.home.favoritesFilter")}
            </Button>
            {search.artist ? (
              <span className="flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm" data-testid="artist-filter">
                {t("library.byArtist", { name: search.artist })}
                <button type="button" className="rounded-full p-0.5 hover:bg-background" onClick={() => setFilter({ artist: undefined })} aria-label={t("library.clearArtist")}>
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
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

/**
 * Saving the current filters as a smart list (issue #58); on a smart list,
 * saving changes to it, renaming it or deleting it.
 */
function SmartListBar({ search, filtered }: { search: LibrarySearch; filtered: boolean }) {
  const { t } = useTranslation();
  const navigate = Route.useNavigate();
  const lists = useSmartLists();
  const list = search.list ? lists.find((candidate) => candidate.id === search.list) : undefined;
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = list ? !sameFilters(list.filters, search) : false;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshSmartLists();
      setNaming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!list && !filtered) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="smart-list-bar">
      {naming ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            void run(async () => {
              if (naming === "rename" && list) {
                await apiClient.updateSmartList(list.id, { name: trimmed });
              } else {
                const created = await apiClient.createSmartList(trimmed, filtersOf(search));
                void navigate({ search: { ...filtersOf(search), list: created.id } });
              }
            });
          }}
        >
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus aria-label={t("library.smartListName")} placeholder={t("library.smartListName")} className="w-56" />
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            {t("library.saveSmartList")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(null)}>
            {t("library.cancel")}
          </Button>
        </form>
      ) : list ? (
        <>
          {changed ? (
            <Button size="sm" disabled={busy} onClick={() => void run(async () => void (await apiClient.updateSmartList(list.id, { filters: filtersOf(search) })))}>
              {t("library.updateSmartList")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setName(list.name);
              setNaming("rename");
            }}
          >
            {t("library.renameSmartList")}
          </Button>
          <ConfirmButton
            label={t("library.deleteSmartList")}
            confirmLabel={t("library.confirmDeleteSmartList")}
            busyLabel={t("library.deleting")}
            cancelLabel={t("library.cancel")}
            busy={busy}
            onConfirm={() =>
              void run(async () => {
                await apiClient.deleteSmartList(list.id);
                void navigate({ search: {} });
              })
            }
          />
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setName("");
            setNaming("new");
          }}
        >
          <ListFilter />
          {t("library.saveAsSmartList")}
        </Button>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
