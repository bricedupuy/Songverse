import type { LibraryHome, SongVersionSummary } from "@songverse/core";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Music2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/lib/utils";

/** A song as a card shows it; `imageUrl` for when songs have images of their own. */
type CardSong = Pick<SongVersionSummary, "id" | "title" | "artists"> & { workId?: string; imageUrl?: string | null };

/** The same colour for the same song, every time: a hue from its title. */
function hueOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return Math.abs(hash) % 360;
}

/** Up to two letters for a title: "Amazing Grace" is "AG", "Hosanna" is "H". */
function initialsOf(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!.toUpperCase())
    .join("");
}

/**
 * A song's cover (issue #81): its image, once songs have one; until then, a
 * cover of its own - a colour from its title, and its initials - so a
 * shelf never shows an empty box.
 */
export function SongCover({ song, className, size = "card" }: { song: CardSong; className?: string; size?: "card" | "small" | "large" }) {
  const width = size === "small" ? 64 : size === "large" ? 640 : 320;
  if (song.imageUrl) {
    return <img src={`${song.imageUrl}&w=${width}`} alt="" loading="lazy" data-testid="song-image" className={cn("aspect-square w-full rounded-lg object-cover", className)} />;
  }
  const hue = hueOf(song.title);
  return (
    <div
      aria-hidden
      data-testid="song-cover"
      className={cn("relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg text-white", className)}
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 48%), hsl(${(hue + 40) % 360} 60% 28%))` }}
    >
      {size === "small" ? (
        <span className="text-[0.625rem] font-semibold">{initialsOf(song.title)}</span>
      ) : (
        <>
          <span className={cn("font-semibold tracking-tight drop-shadow-sm", size === "large" ? "text-5xl" : "text-3xl")}>{initialsOf(song.title) || <Music2 className="size-8" />}</span>
          <Music2 className="absolute right-2 bottom-2 size-4 opacity-60" />
        </>
      )}
    </div>
  );
}

function SongCard({ song, from }: { song: CardSong; from?: string }) {
  const artists = song.artists.map((artist) => artist.source).filter(Boolean).join(", ");
  return (
    <Link
      to="/library/$songVersionId"
      params={{ songVersionId: song.id }}
      search={from ? { from } : {}}
      className="group flex w-36 shrink-0 snap-start flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
      data-testid="song-card"
    >
      <SongCover song={song} className="transition-transform group-hover:scale-[1.02]" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium group-hover:underline">{song.title}</span>
        {artists ? <span className="truncate text-xs text-muted-foreground">{artists}</span> : null}
      </span>
    </Link>
  );
}

function Shelf({ id, title, songs, more, from }: { id: string; title: string; songs: CardSong[]; more?: ReactNode; from?: string }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`shelf-${id}`} data-testid={`shelf-${id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`shelf-${id}`} className="text-lg font-semibold">
          {title}
        </h2>
        {more}
      </div>
      <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
        {songs.map((song) => (
          <SongCard key={song.id} song={song} from={from} />
        ))}
      </div>
    </section>
  );
}

function SeeAll({ children, ...link }: { children: ReactNode; search: Record<string, string | boolean> }) {
  return (
    <Link to="/library/songs" search={link.search} className="flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
      {children}
      <ChevronRight className="size-4" />
    </Link>
  );
}

/**
 * The Library's home (issue #81), above its list: newly added, recently
 * viewed, favorites and what's popular in the user's teams. A shelf with
 * nothing on it isn't shown.
 */
export function LibraryShelves({ home }: { home: LibraryHome }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-8" data-testid="library-home">
      {home.newest.length > 0 ? (
        <Shelf id="newest" title={t("library.home.newest")} songs={home.newest} from="sort=createdAt&dir=desc" more={<SeeAll search={{ sort: "createdAt", dir: "desc" }}>{t("library.home.seeAll")}</SeeAll>} />
      ) : null}
      {home.recent.length > 0 ? <Shelf id="recent" title={t("library.home.recent")} songs={home.recent} /> : null}
      {home.favorites.length > 0 ? (
        <Shelf id="favorites" title={t("library.home.favorites")} songs={home.favorites} from="favorites=true" more={<SeeAll search={{ favorites: true }}>{t("library.home.seeAll")}</SeeAll>} />
      ) : null}
      {home.popular.length > 0 ? <Shelf id="popular" title={t("library.home.popular")} songs={home.popular} /> : null}
    </div>
  );
}
