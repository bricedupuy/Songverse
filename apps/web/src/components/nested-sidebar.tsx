import { keptSetDetail, keptSongbook, onlineOrKept, transposeKey, type ListSongVersionsQuery, type PeopleOverview, type SetlistDetail, type SetlistSummary, type SongbookDetail, type SongbookSummary, type SongVersionSummary, type TeamSummary } from "@songverse/core";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  Contact,
  Database,
  FileStack,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  ListMusic,
  Music2,
  Plus,
  ShieldCheck,
  Star,
  Users,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AccountMenuContent } from "#/components/app-sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { DropdownMenu, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { SidebarRail, useSidebar } from "#/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { apiClient } from "#/lib/api-client";
import { sizedAvatarUrl } from "#/lib/avatar-url";
import { initials } from "#/lib/initials";
import type { AppSession } from "#/lib/server-auth";
import { deviceStorage } from "#/lib/offline-data";
import { setlistTitle, setOwnerLabel, transposeLabel } from "#/lib/setlists";
import { smartListSearch, useSmartLists } from "#/lib/smart-lists";
import { cn } from "#/lib/utils";

type Section = "library" | "sets" | "songbooks" | "teams" | "people" | "review" | "admin";
const SECTIONS: Section[] = ["library", "sets", "songbooks", "teams", "people", "review", "admin"];

/** The section a page belongs to, if any (the dashboard, offline storage and account pages don't). */
const sectionOf = (pathname: string): Section | null => SECTIONS.find((s) => pathname === `/${s}` || pathname.startsWith(`/${s}/`)) ?? null;

/** Matching ignoring case and accents, as the library's search does. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * The sidebar on a wider screen (issue #80), after shadcn's sidebar-09
 * ("collapsible nested sidebars"): a rail of icons - Library, Sets,
 * Songbooks, Teams, People - and beside it a panel listing what's in the
 * section you're in, so you go from one song, set or songbook to the next
 * without going back to the list. Collapsing it (the header's button, its
 * edge, Ctrl/Cmd B) hides the panel and leaves the rail.
 */
export function NestedSidebar({
  session,
  teams,
  songbooks,
  setlists,
}: {
  session: AppSession;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
  setlists: SetlistSummary[];
}) {
  const { t } = useTranslation();
  const { state, open, setOpen } = useSidebar();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // A song opened from a songbook stays in the songbook (issue #80).
  const fromSongbook = useRouterState({ select: (s) => (s.location.pathname.startsWith("/library/") ? (s.location.search as { songbook?: string }).songbook : undefined) });
  const section = fromSongbook ? "songbooks" : sectionOf(pathname);
  // The panel shows the section you're in; on a page outside them (the dashboard…), the last one.
  const [panel, setPanel] = useState<Section>(section ?? "library");
  useEffect(() => {
    if (section) setPanel(section);
  }, [section]);
  const canReview = session.isGlobalAdmin || session.isReviewer;

  const rail: { section: Section; to: "/library" | "/sets" | "/songbooks" | "/teams" | "/people" | "/review" | "/admin"; label: string; icon: ReactNode }[] = [
    { section: "library", to: "/library", label: t("nav.library"), icon: <Music2 /> },
    { section: "sets", to: "/sets", label: t("nav.sets"), icon: <ListMusic /> },
    { section: "songbooks", to: "/songbooks", label: t("nav.songbooks"), icon: <BookOpen /> },
    { section: "teams", to: "/teams", label: t("nav.teams"), icon: <UsersRound /> },
    { section: "people", to: "/people", label: t("nav.people"), icon: <Contact /> },
  ];
  const lower: typeof rail = [
    ...(canReview ? [{ section: "review" as const, to: "/review" as const, label: t("nav.review"), icon: <ClipboardCheck /> }] : []),
    ...(session.isGlobalAdmin ? [{ section: "admin" as const, to: "/admin" as const, label: t("nav.admin"), icon: <ShieldCheck /> }] : []),
  ];
  const railItem = (item: (typeof rail)[number]) => (
    <Tooltip key={item.section}>
      <TooltipTrigger asChild>
        <Link
          to={item.to}
          aria-label={item.label}
          data-active={section === item.section}
          onClick={() => {
            setPanel(item.section);
            if (!open) setOpen(true);
          }}
          className={cn(
            "flex size-9 items-center justify-center rounded-md text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4",
            section === item.section && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          {item.icon}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
  const title = [...rail, ...lower].find((item) => item.section === panel)?.label ?? "";

  return (
    <div
      data-slot="sidebar"
      data-state={state}
      className="group/sidebar sticky top-0 relative hidden h-screen shrink-0 self-start border-r bg-sidebar text-sidebar-foreground md:flex"
    >
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2" data-testid="sidebar-rail">
        <Link to="/library" className="mb-2 flex size-9 items-center justify-center" aria-label="SongVerse">
          <Music2 className="size-5" />
        </Link>
        {rail.map(railItem)}
        <div className="mt-auto flex flex-col items-center gap-1">
          {lower.map(railItem)}
        </div>
        <div data-slot="sidebar-footer" className="flex flex-col items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="mt-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="account-menu" aria-label={session.displayName}>
                <Avatar className="size-8">
                  {session.avatarUrl ? <AvatarImage src={sizedAvatarUrl(session.avatarUrl, 32)} alt="" /> : null}
                  <AvatarFallback className="text-xs">{initials(session.displayName)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <AccountMenuContent session={session} side="right" align="end" />
          </DropdownMenu>
        </div>
      </nav>
      <div className={cn("overflow-hidden transition-[width] duration-200 ease-linear", open ? "w-72" : "w-0")} aria-hidden={!open}>
        <section className="flex h-full w-72 flex-col" aria-label={t("nav.panel", { section: title })} data-testid="sidebar-panel" data-section={panel}>
          {panel === "library" ? <LibraryPanel title={title} pathname={pathname} /> : null}
          {panel === "sets" ? <SetsPanel title={title} pathname={pathname} setlists={setlists} /> : null}
          {panel === "songbooks" ? <SongbooksPanel title={title} pathname={pathname} songbooks={songbooks} fromSongbook={fromSongbook} /> : null}
          {panel === "teams" ? <TeamsPanel title={title} pathname={pathname} teams={teams} /> : null}
          {panel === "people" ? <PeoplePanel title={title} /> : null}
          {panel === "review" ? <LinksPanel title={title} pathname={pathname} links={[{ to: "/review", label: t("nav.review"), icon: <ClipboardCheck /> }]} /> : null}
          {panel === "admin" ? (
            <LinksPanel
              title={title}
              pathname={pathname}
              links={[
                { to: "/admin/users", label: t("nav.adminUsers"), icon: <Users /> },
                { to: "/admin/auth", label: t("nav.adminAuth"), icon: <KeyRound /> },
                { to: "/admin/storage", label: t("nav.adminStorage"), icon: <Database /> },
                { to: "/admin/catalogs", label: t("nav.adminCatalogs"), icon: <FileStack /> },
                { to: "/admin/metadata", label: t("nav.adminMetadata"), icon: <LayoutDashboard /> },
                { to: "/library", label: t("nav.backToApp"), icon: <ArrowLeft /> },
              ]}
            />
          ) : null}
        </section>
      </div>
      <SidebarRail />
    </div>
  );
}

// --- the panel's parts

function PanelHeader({ title, filter, onFilter, newItem, children }: { title: string; filter?: string; onFilter?: (value: string) => void; newItem?: ReactNode; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 border-b p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-medium text-foreground" data-testid="sidebar-panel-title">{title}</p>
        {newItem}
      </div>
      {onFilter ? <Input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder={t("nav.filter")} aria-label={t("nav.filter")} className="h-8 bg-background" /> : null}
      {children}
    </div>
  );
}

function NewLink({ to, label }: { to: "/sets/new" | "/songbooks/new" | "/teams/new" | "/library/new"; label: string }) {
  return (
    <Link to={to} aria-label={label} title={label} className="flex size-7 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-4">
      <Plus />
    </Link>
  );
}

/** One entry of the panel's list: a title, and a line under it. */
function PanelEntry({ active, title, detail, children }: { active: boolean; title: string; detail?: string | null; children: (className: string, content: ReactNode) => ReactNode }) {
  return (
    <li>
      {children(
        cn(
          "flex flex-col gap-0.5 border-b px-3 py-2.5 text-sm leading-tight outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent",
          active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        ),
        <>
          <span className="truncate">{title}</span>
          {detail ? <span className="truncate text-xs font-normal text-muted-foreground">{detail}</span> : null}
        </>,
      )}
    </li>
  );
}

function PanelList({ children, empty }: { children: ReactNode[]; empty?: string }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const list = useRef<HTMLDivElement>(null);
  // What you're viewing stays in sight in a long list.
  useEffect(() => {
    list.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname, children.length]);
  return (
    <div ref={list} className="min-h-0 flex-1 overflow-y-auto">
      {children.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{empty ?? t("nav.nothingMatches")}</p> : <ul data-testid="sidebar-panel-list">{children}</ul>}
    </div>
  );
}

const PAGE_SIZE = 50;

function LibraryPanel({ title, pathname }: { title: string; pathname: string }) {
  const { t } = useTranslation();
  const smartLists = useSmartLists();
  // "favorites" for the user's favorites (issue #81), else a smart list's id.
  const urlList = useRouterState({
    select: (s) => {
      if (s.location.pathname !== "/library/songs") return undefined;
      const search = s.location.search as { list?: string; favorites?: boolean };
      return search.favorites ? "favorites" : (search.list ?? null);
    },
  });
  const [filter, setFilter] = useState("");
  // The smart list the panel lists: the one open on Songs, or the last one opened.
  const [listId, setListId] = useState<string | null>(urlList ?? null);
  useEffect(() => {
    if (urlList !== undefined) setListId(urlList);
  }, [urlList]);
  const [songs, setSongs] = useState<SongVersionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const filters: ListSongVersionsQuery = listId === "favorites" ? { favorites: true } : (smartLists.find((list) => list.id === listId)?.filters ?? {});
  const query = JSON.stringify({ ...filters, q: [filters.q, filter.trim()].filter(Boolean).join(" ") || undefined });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient
        .listSongVersions({ sort: "title", dir: "asc", ...JSON.parse(query), page, pageSize: PAGE_SIZE })
        .then((result) => {
          if (cancelled) return;
          setFailed(false);
          setTotal(result.total);
          setSongs((before) => (page === 1 ? result.items : [...before, ...result.items]));
        })
        .catch(() => !cancelled && setFailed(true));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, page]);
  useEffect(() => setPage(1), [query]);

  const chip = (active: boolean) =>
    cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-sidebar-accent", active && "border-primary bg-primary/10 text-foreground");
  return (
    <>
      <PanelHeader title={title} filter={filter} onFilter={setFilter} newItem={<NewLink to="/library/new" label={t("nav.new")} />}>
        {/* Songs (what Library opens on), the user's smart lists (issue #58) and artists. */}
        <div className="flex flex-wrap gap-1.5" data-testid="library-sections">
          <Link to="/library/songs" className={chip(pathname === "/library/songs" && !urlList)}>
            {t("nav.songs")}
          </Link>
          <Link to="/library/songs" search={{ favorites: true }} className={chip(listId === "favorites")}>
            <Star className="size-3" />
            {t("library.home.favorites")}
          </Link>
          {smartLists.map((list) => (
            <Link key={list.id} to="/library/songs" search={smartListSearch(list)} className={chip(listId === list.id)}>
              <ListFilter className="size-3" />
              {list.name}
            </Link>
          ))}
          <Link to="/library/artists" className={chip(pathname === "/library/artists")}>
            {t("nav.artists")}
          </Link>
        </div>
      </PanelHeader>
      {failed && songs.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{t("nav.listUnavailable")}</p>
      ) : (
        <PanelList>
          {[
            ...songs.map((song) => (
              <PanelEntry key={song.id} active={pathname === `/library/${song.id}` || pathname.startsWith(`/library/${song.id}/`)} title={song.title} detail={song.artists.map((a) => a.source).filter(Boolean).join(", ")}>
                {(className, content) => (
                  <Link to="/library/$songVersionId" params={{ songVersionId: song.id }} className={className}>
                    {content}
                  </Link>
                )}
              </PanelEntry>
            )),
            ...(songs.length < total
              ? [
                  <li key="more">
                    <button type="button" className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-sidebar-accent" onClick={() => setPage(page + 1)}>
                      {t("nav.showMore")}
                    </button>
                  </li>,
                ]
              : []),
          ]}
        </PanelList>
      )}
    </>
  );
}

function SetsPanel({ title, pathname, setlists }: { title: string; pathname: string; setlists: SetlistSummary[] }) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState("");
  // In a set (its page, or one of its songs): the panel lists its songs; back to the sets from there.
  const openSet = /^\/sets\/(?!new$)([^/]+)/.exec(pathname)?.[1] ?? null;
  const [listingSets, setListingSets] = useState(false);
  useEffect(() => setListingSets(false), [pathname]);
  if (openSet && !listingSets) return <SetSongsPanel setId={openSet} pathname={pathname} sets={title} onBack={() => setListingSets(true)} />;
  const shown = setlists.filter((set) => fold(setlistTitle(set, t, i18n.language)).includes(fold(filter.trim())));
  return (
    <>
      <PanelHeader title={title} filter={filter} onFilter={setFilter} newItem={<NewLink to="/sets/new" label={t("nav.new")} />} />
      <PanelList empty={filter ? undefined : t("sets.noSetsYet")}>
        {shown.map((set) => (
          <PanelEntry
            key={set.id}
            active={pathname === `/sets/${set.id}` || pathname.startsWith(`/sets/${set.id}/`)}
            title={setlistTitle(set, t, i18n.language)}
            detail={[set.teamName ?? (set.isGuest ? set.ownerName : null) ?? t("nav.personal"), t("nav.songCount", { count: set.itemCount })].join(" · ")}
          >
            {(className, content) => (
              <Link to="/sets/$setlistId" params={{ setlistId: set.id }} className={className}>
                {content}
              </Link>
            )}
          </PanelEntry>
        ))}
      </PanelList>
    </>
  );
}

/** One set's songs, in order (issue #80): its overview, then each song, the one you're on marked. */
function SetSongsPanel({ setId, pathname, sets, onBack }: { setId: string; pathname: string; sets: string; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const [set, setSet] = useState<SetlistDetail | null>(null);
  const [failed, setFailed] = useState(false);
  // Fetched again when the set's page reloads its own (a song added, moved, removed…).
  const reloaded = useRouterState({ select: (s) => s.matches.find((match) => match.routeId.includes("$setlistId"))?.updatedAt });
  useEffect(() => {
    let cancelled = false;
    onlineOrKept(
      () => apiClient.getSetlist(setId),
      () => keptSetDetail(deviceStorage(), setId),
    )
      .then((detail) => {
        if (cancelled) return;
        setSet(detail);
        setFailed(!detail);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [setId, reloaded]);

  return (
    <>
      <div className="flex flex-col gap-2 border-b p-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 self-start rounded-md text-sm text-muted-foreground hover:text-foreground" data-testid="sidebar-panel-back">
          <ChevronLeft className="size-4" />
          <span data-testid="sidebar-panel-title">{sets}</span>
        </button>
        {set ? (
          <Link
            to="/sets/$setlistId"
            params={{ setlistId: set.id }}
            activeOptions={{ exact: true }}
            className="flex flex-col gap-0.5 rounded-md px-1 py-0.5 hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent"
          >
            <span className="truncate text-base font-medium text-foreground">{setlistTitle(set, t, i18n.language)}</span>
            <span className="truncate text-xs text-muted-foreground">{[setOwnerLabel(set, t), t("nav.songCount", { count: set.items.length })].join(" · ")}</span>
          </Link>
        ) : null}
      </div>
      {failed ? (
        <p className="p-3 text-sm text-muted-foreground">{t("nav.listUnavailable")}</p>
      ) : set ? (
        <PanelList empty={t("sets.emptySet")}>
          {set.items.map((item, index) => {
            const song = item.song;
            const baseKey = song?.key && item.arrangement ? (transposeKey(song.key, item.arrangement.transposeSteps) ?? song.key) : (song?.key ?? null);
            return (
              <PanelEntry
                key={item.id}
                active={pathname === `/sets/${set.id}/songs/${item.id}`}
                title={`${index + 1}. ${song?.title ?? t("sets.hiddenSong")}`}
                detail={song ? [item.arrangement?.name, transposeLabel(baseKey, item.transposeSteps, t)].filter(Boolean).join(" · ") : null}
              >
                {(className, content) => (
                  <Link to="/sets/$setlistId/songs/$itemId" params={{ setlistId: set.id, itemId: item.id }} className={className}>
                    {content}
                  </Link>
                )}
              </PanelEntry>
            );
          })}
        </PanelList>
      ) : null}
    </>
  );
}

function SongbooksPanel({ title, pathname, songbooks, fromSongbook }: { title: string; pathname: string; songbooks: SongbookSummary[]; fromSongbook?: string }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  // In a songbook (its page, or a song opened from it): the panel lists its songs; back to the songbooks from there.
  const openBook = /^\/songbooks\/(?!new$)([^/]+)/.exec(pathname)?.[1] ?? fromSongbook ?? null;
  const [listingBooks, setListingBooks] = useState(false);
  useEffect(() => setListingBooks(false), [pathname]);
  if (openBook && !listingBooks) return <SongbookSongsPanel songbookId={openBook} pathname={pathname} songbooks={title} onBack={() => setListingBooks(true)} />;
  const shown = songbooks.filter((book) => fold(`${book.name} ${book.abbreviation ?? ""}`).includes(fold(filter.trim())));
  return (
    <>
      <PanelHeader title={title} filter={filter} onFilter={setFilter} newItem={<NewLink to="/songbooks/new" label={t("nav.new")} />} />
      <PanelList empty={filter ? undefined : t("songbooks.noSongbooksYet")}>
        {shown.map((book) => (
          <PanelEntry key={book.id} active={pathname === `/songbooks/${book.id}`} title={book.name} detail={[book.abbreviation, book.publisher].filter(Boolean).join(" · ")}>
            {(className, content) => (
              <Link to="/songbooks/$songbookId" params={{ songbookId: book.id }} className={className}>
                {content}
              </Link>
            )}
          </PanelEntry>
        ))}
      </PanelList>
    </>
  );
}

/** One songbook's songs (issue #80), by number: filtered by number or title, the one you're on marked. */
function SongbookSongsPanel({ songbookId, pathname, songbooks, onBack }: { songbookId: string; pathname: string; songbooks: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [book, setBook] = useState<SongbookDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("");
  // Fetched again when the songbook's page reloads its own (an entry added or removed…).
  const reloaded = useRouterState({ select: (s) => s.matches.find((match) => match.routeId.includes("$songbookId"))?.updatedAt });
  useEffect(() => {
    let cancelled = false;
    onlineOrKept(
      () => apiClient.getSongbook(songbookId),
      () => keptSongbook(deviceStorage(), songbookId),
    )
      .then((detail) => {
        if (cancelled) return;
        setBook(detail ?? null);
        setFailed(!detail);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [songbookId, reloaded]);
  const wanted = fold(filter.trim());
  // A number finds that entry (and those it starts); words, the titles.
  const byNumber = /^\d+$/.test(wanted);
  const shown = (book?.entries ?? []).filter((entry) =>
    byNumber ? (entry.entryCode ?? "").startsWith(wanted) : fold(`${entry.entryCode ?? ""} ${entry.songVersionTitle ?? ""}`).includes(wanted),
  );

  return (
    <>
      <div className="flex flex-col gap-2 border-b p-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1 self-start rounded-md text-sm text-muted-foreground hover:text-foreground" data-testid="sidebar-panel-back">
          <ChevronLeft className="size-4" />
          <span data-testid="sidebar-panel-title">{songbooks}</span>
        </button>
        {book ? (
          <Link
            to="/songbooks/$songbookId"
            params={{ songbookId: book.id }}
            className="flex flex-col gap-0.5 rounded-md px-1 py-0.5 hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent"
          >
            <span className="truncate text-base font-medium text-foreground">{book.name}</span>
            <span className="truncate text-xs text-muted-foreground">{[book.abbreviation, t("nav.songCount", { count: book.entries.length })].filter(Boolean).join(" · ")}</span>
          </Link>
        ) : null}
        <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t("nav.filter")} aria-label={t("nav.filter")} className="h-8 bg-background" />
      </div>
      {failed ? (
        <p className="p-3 text-sm text-muted-foreground">{t("nav.listUnavailable")}</p>
      ) : book ? (
        <PanelList empty={filter ? undefined : t("songbooks.noEntriesYet")}>
          {shown.map((entry) => (
            <PanelEntry
              key={entry.id}
              active={pathname === `/library/${entry.songVersionId}`}
              title={[entry.entryCode, entry.songVersionTitle ?? t("sets.hiddenSong")].filter(Boolean).join(". ")}
              detail={entry.sectionLabel}
            >
              {(className, content) => (
                <Link to="/library/$songVersionId" params={{ songVersionId: entry.songVersionId }} search={{ songbook: book.id }} className={className}>
                  {content}
                </Link>
              )}
            </PanelEntry>
          ))}
        </PanelList>
      ) : null}
    </>
  );
}

function TeamsPanel({ title, pathname, teams }: { title: string; pathname: string; teams: TeamSummary[] }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const shown = teams.filter((team) => fold(team.name).includes(fold(filter.trim())));
  return (
    <>
      <PanelHeader title={title} filter={filter} onFilter={setFilter} newItem={<NewLink to="/teams/new" label={t("nav.new")} />} />
      <PanelList empty={filter ? undefined : t("nav.noTeams")}>
        {shown.map((team) => (
          <PanelEntry key={team.id} active={pathname === `/teams/${team.id}`} title={team.name} detail={team.description}>
            {(className, content) => (
              <Link to="/teams/$teamId" params={{ teamId: team.id }} className={className}>
                {content}
              </Link>
            )}
          </PanelEntry>
        ))}
      </PanelList>
    </>
  );
}

function PeoplePanel({ title }: { title: string }) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<PeopleOverview["people"] | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    apiClient
      .getPeople()
      .then((overview) => setPeople(overview.people))
      .catch(() => setPeople([]));
  }, []);
  const shown = (people ?? []).filter((person) => fold(person.displayName).includes(fold(filter.trim())));
  return (
    <>
      <PanelHeader title={title} filter={filter} onFilter={setFilter} />
      <PanelList empty={filter ? undefined : t("people.none")}>
        {shown.map((person) => (
          <PanelEntry key={person.id} active={false} title={person.displayName} detail={person.email}>
            {(className, content) => (
              <Link to="/people" className={className}>
                {content}
              </Link>
            )}
          </PanelEntry>
        ))}
      </PanelList>
    </>
  );
}

function LinksPanel({ title, pathname, links }: { title: string; pathname: string; links: { to: "/review" | "/library" | "/admin/users" | "/admin/auth" | "/admin/storage" | "/admin/catalogs" | "/admin/metadata"; label: string; icon: ReactNode }[] }) {
  return (
    <>
      <PanelHeader title={title} />
      <nav className="flex flex-col gap-1 p-2">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            data-active={pathname.startsWith(link.to)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent [&>svg]:size-4",
              pathname.startsWith(link.to) && link.to !== "/library" && "bg-sidebar-accent font-medium",
            )}
          >
            {link.icon}
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
