import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { apiClient } from "#/lib/api-client";

/**
 * The artists of the songs you can see (issue #58), with how many songs
 * each; one opens the library's songs by them.
 */
export const Route = createFileRoute("/_protected/library/artists")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    // "?q=123" is read as a number.
    const q = typeof search.q === "number" ? String(search.q) : search.q;
    return typeof q === "string" && q.trim() ? { q } : {};
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({ artists: await apiClient.listArtists(deps.q) }),
  component: ArtistsPage,
});

function ArtistsPage() {
  const { t } = useTranslation();
  const { artists } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q ?? "");

  // Search as you type, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q === (search.q ?? "")) return;
    const timer = setTimeout(() => void navigate({ search: { q: q || undefined }, replace: true }), 300);
    return () => clearTimeout(timer);
  }, [query, search.q, navigate]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("library.artists")}</h1>
      <Card className="gap-0 p-0">
        <div className="px-4 pt-4 pb-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("library.searchArtists")}
              aria-label={t("library.searchArtists")}
              className="pl-9"
            />
          </div>
        </div>
        {artists.length === 0 ? (
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{search.q ? t("library.noArtistsMatch") : t("library.noArtistsYet")}</CardContent>
        ) : (
          <ul className="grid gap-x-6 border-t px-4 py-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="artist-list">
            {artists.map((artist) => (
              <li key={artist.name} className="border-b last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0">
                <Link to="/library" search={{ artist: artist.name }} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
                  <span className="truncate font-medium">{artist.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t("library.songCount", { count: artist.songCount })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t px-4 py-3 text-sm text-muted-foreground" data-testid="artist-count">
          {t("library.artistCount", { count: artists.length })}
        </div>
      </Card>
    </div>
  );
}
