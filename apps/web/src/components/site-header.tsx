import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "#/components/ui/breadcrumb";
import { CommandSearch } from "#/components/command-search";
import { ModeSwitch } from "#/components/mode-switch";
import { Separator } from "#/components/ui/separator";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { useMode } from "#/lib/mode";
import { setlistTitle } from "#/lib/setlists";
import { cn } from "#/lib/utils";

interface Crumb {
  label: string;
  to?: string;
}

// Each area of the app: its first crumb, named as the sidebar names it.
const SECTIONS: { path: string; label: string }[] = [
  { path: "library", label: "nav.library" },
  { path: "sets", label: "nav.sets" },
  { path: "songbooks", label: "nav.songbooks" },
  { path: "songbook-catalogs", label: "songbookCatalog.title" },
  { path: "teams", label: "nav.teams" },
  { path: "review", label: "nav.review" },
  { path: "admin", label: "nav.admin" },
  { path: "account", label: "nav.account" },
  { path: "dashboard", label: "nav.dashboard" },
  { path: "offline", label: "nav.offlineStorage" },
];
const ADMIN_PAGES: Record<string, string> = {
  users: "nav.adminUsers",
  auth: "nav.adminAuth",
  storage: "nav.adminStorage",
  catalogs: "nav.adminCatalogs",
  metadata: "nav.adminMetadata",
};

/** Names the page's own data gives, whichever page it is. */
interface PageData {
  version?: { title?: string };
  // A song's page: online, or kept offline.
  online?: { version?: { title?: string } };
  offline?: { title?: string };
  arrangement?: { name?: string };
  catalog?: { name?: string };
  songbook?: { name?: string };
  team?: { name?: string };
  submission?: { song?: { title?: string } };
  song?: { title?: string } | null;
}

function useBreadcrumbs(): Crumb[] {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const page = useRouterState({ select: (s) => (s.matches.at(-1)?.loaderData ?? {}) as PageData });
  const { setlists, songbooks, teams } = useRouteContext({ from: "/_protected" });

  const [section, id, sub, subId] = pathname.split("/").filter(Boolean);
  const area = SECTIONS.find((candidate) => candidate.path === section);
  if (!area) return [];
  const crumbs: Crumb[] = [{ label: t(area.label), to: `/${area.path}` }];
  if (id) {
    let label: string;
    if (id === "new") label = section === "library" ? t("breadcrumb.addASong") : t("breadcrumb.new");
    else if (section === "admin") label = ADMIN_PAGES[id] ? t(ADMIN_PAGES[id]) : id;
    else if (section === "sets") {
      const set = setlists.find((candidate) => candidate.id === id);
      label = set ? setlistTitle(set, t, i18n.language) : t("breadcrumb.set");
    } else if (section === "songbooks") label = songbooks.find((book) => book.id === id)?.name ?? page.songbook?.name ?? t("breadcrumb.songbook");
    else if (section === "teams") label = teams.find((team) => team.id === id)?.name ?? page.team?.name ?? t("breadcrumb.team");
    else if (section === "library") label = page.version?.title ?? page.online?.version?.title ?? page.offline?.title ?? t("breadcrumb.song");
    else if (section === "songbook-catalogs") label = page.catalog?.name ?? t("breadcrumb.catalog");
    else if (section === "review") label = page.submission?.song?.title ?? t("breadcrumb.song");
    else label = id;
    crumbs.push({ label, to: `/${section}/${id}` });
  }
  if (sub && subId) {
    if (section === "sets" && sub === "songs") crumbs.push({ label: page.song?.title ?? t("sets.hiddenSong") });
    else if (section === "library" && sub === "arrangements") crumbs.push({ label: page.arrangement?.name ?? t("sets.arrangement") });
  }
  // The page you're on isn't a link.
  delete crumbs[crumbs.length - 1]!.to;
  return crumbs;
}

export function SiteHeader() {
  const crumbs = useBreadcrumbs();
  const { mode } = useMode();

  return (
    <header className={cn("flex h-14 shrink-0 items-center gap-2 border-b", mode !== "edit" && "border-b-2 border-b-primary")}>
      <div className="flex w-full min-w-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList>
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5 sm:gap-2.5">
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {crumb.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.to}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <CommandSearch />
          <ModeSwitch />
        </div>
      </div>
    </header>
  );
}
