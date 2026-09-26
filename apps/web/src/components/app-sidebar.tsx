import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ChevronsUpDown,
  ClipboardCheck,
  Database,
  FileStack,
  HelpCircle,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  ListMusic,
  LogOut,
  Moon,
  Music2,
  ShieldCheck,
  Sun,
  Users,
  UsersRound,
  Contact,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "#/lib/auth-client";
import type { AppSession } from "#/lib/server-auth";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { sizedAvatarUrl } from "#/lib/avatar-url";
import { docsUrl } from "#/lib/docs";
import { forgetOffline } from "#/lib/offline-db";
import { setTheme, useMode } from "#/lib/mode";
import { forgetSmartLists, smartListSearch, useSmartLists } from "#/lib/smart-lists";
import { setlistTitle } from "#/lib/setlists";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "#/components/ui/sidebar";
import { initials } from "#/lib/initials";

export function AppSidebar({
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
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inAdmin = pathname.startsWith("/admin");

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/library" className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <Music2 className="size-5 shrink-0" />
          <SidebarLabel>SongVerse</SidebarLabel>
        </Link>
      </SidebarHeader>
      {inAdmin ? (
        <AdminNav pathname={pathname} />
      ) : (
        <MainNav
          pathname={pathname}
          teams={teams}
          songbooks={songbooks}
          setlists={setlists}
          isGlobalAdmin={session.isGlobalAdmin}
          canReview={session.isGlobalAdmin || session.isReviewer}
        />
      )}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12" data-testid="account-menu">
                  <Avatar className="size-8 shrink-0">
                    {session.avatarUrl ? <AvatarImage src={sizedAvatarUrl(session.avatarUrl, 32)} alt="" /> : null}
                    <AvatarFallback className="text-xs">{initials(session.displayName)}</AvatarFallback>
                  </Avatar>
                  <SidebarLabel className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{session.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{session.email}</span>
                  </SidebarLabel>
                  <SidebarLabel>
                    <ChevronsUpDown className="size-4 text-muted-foreground" />
                  </SidebarLabel>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-60">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{session.displayName}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{session.email}</span>
                  </span>
                  {/* Edit and Practice's light or dark theme; Live is always dark (issue #67). */}
                  <ThemeToggle />
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard />
                    {t("nav.dashboard")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/dashboard" hash="settings">
                    <KeyRound />
                    {t("nav.account")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/offline">
                    <HardDrive />
                    {t("nav.offlineStorage")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={docsUrl(pathname, i18n.language)} target="_blank" rel="noopener">
                    <HelpCircle />
                    {t("nav.help")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    forgetSmartLists();
                    void Promise.all([authClient.signOut(), forgetOffline()]).then(() => {
                      window.location.href = "/";
                    });
                  }}
                >
                  <LogOut />
                  {t("nav.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

const SIDEBAR_SET_LIMIT = 8;

/** A sun or a moon: Edit and Practice's theme, the other way. Not in Live, which is always dark. */
function ThemeToggle() {
  const { t } = useTranslation();
  const { mode, theme } = useMode();
  if (mode === "live") return null;
  const label = theme === "dark" ? t("mode.lightTheme") : t("mode.darkTheme");
  return (
    <button
      type="button"
      className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-accent-foreground [&_svg]:size-4"
      aria-label={label}
      title={label}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

/** Hides its children in icon-rail (collapsed, non-mobile) mode - same rule SidebarGroupLabel follows. */
function SidebarLabel({ children, className }: { children: ReactNode; className?: string }) {
  const { state, isMobile } = useSidebar();
  if (state === "collapsed" && !isMobile) return null;
  return <span className={className}>{children}</span>;
}

function MainNav({
  pathname,
  teams,
  songbooks,
  setlists,
  isGlobalAdmin,
  canReview,
}: {
  pathname: string;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
  setlists: SetlistSummary[];
  isGlobalAdmin: boolean;
  canReview: boolean;
}) {
  const { t, i18n } = useTranslation();
  // Upcoming and undated sets come first (the API's order); past ones are
  // on the Sets page.
  const shownSetlists = setlists.slice(0, SIDEBAR_SET_LIMIT);
  const smartLists = useSmartLists();
  const listId = useRouterState({ select: (s) => (s.location.search as { list?: string }).list });

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{t("nav.platform")}</SidebarGroupLabel>
        <SidebarMenu>
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/library")} tooltip={t("nav.library")}>
                <Link to="/library">
                  <Music2 />
                  <span>{t("nav.library")}</span>
                </Link>
              </SidebarMenuButton>
              <CollapsibleTrigger asChild>
                <SidebarMenuAction>
                  <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  <span className="sr-only">{t("nav.toggle")}</span>
                </SidebarMenuAction>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {/* Songs (what Library opens on), artists, and the user's smart lists (issue #58). */}
                <SidebarMenuSub data-testid="library-sections">
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname === "/library" && !listId}>
                      <Link to="/library">
                        <span>{t("nav.songs")}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname === "/library/artists"}>
                      <Link to="/library/artists">
                        <span>{t("nav.artists")}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  {smartLists.map((list) => (
                    <SidebarMenuSubItem key={list.id}>
                      <SidebarMenuSubButton asChild isActive={pathname === "/library" && listId === list.id}>
                        <Link to="/library" search={smartListSearch(list)}>
                          <ListFilter className="size-3.5" />
                          <span className="truncate">{list.name}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>

          <Collapsible defaultOpen className="group/collapsible">
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/sets")} tooltip={t("nav.sets")}>
                <Link to="/sets">
                  <ListMusic />
                  <span>{t("nav.sets")}</span>
                </Link>
              </SidebarMenuButton>
              <CollapsibleTrigger asChild>
                <SidebarMenuAction>
                  <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  <span className="sr-only">{t("nav.toggle")}</span>
                </SidebarMenuAction>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {setlists.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">{t("sets.noSetsYet")}</p>
                  ) : (
                    <>
                      {shownSetlists.map((set) => (
                        <SidebarMenuSubItem key={set.id}>
                          <SidebarMenuSubButton asChild isActive={pathname === `/sets/${set.id}`}>
                            <Link to="/sets/$setlistId" params={{ setlistId: set.id }}>
                              <span className="truncate">{setlistTitle(set, t, i18n.language)}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      {setlists.length > shownSetlists.length ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <Link to="/sets" className="text-muted-foreground">
                              <span>{t("sets.viewAll", { count: setlists.length })}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : null}
                    </>
                  )}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>

          <Collapsible defaultOpen className="group/collapsible">
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/songbooks")} tooltip={t("nav.songbooks")}>
                <Link to="/songbooks">
                  <BookOpen />
                  <span>{t("nav.songbooks")}</span>
                </Link>
              </SidebarMenuButton>
              <CollapsibleTrigger asChild>
                <SidebarMenuAction>
                  <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  <span className="sr-only">{t("nav.toggle")}</span>
                </SidebarMenuAction>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {songbooks.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">{t("songbooks.noSongbooksYet")}</p>
                  ) : (
                    songbooks.map((songbook) => (
                      <SidebarMenuSubItem key={songbook.id}>
                        <SidebarMenuSubButton asChild isActive={pathname === `/songbooks/${songbook.id}`}>
                          <Link to="/songbooks/$songbookId" params={{ songbookId: songbook.id }}>
                            <span className="truncate">{songbook.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))
                  )}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>

          <Collapsible defaultOpen className="group/collapsible">
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/teams")} tooltip={t("nav.teams")}>
                <Link to="/teams">
                  <UsersRound />
                  <span>{t("nav.teams")}</span>
                </Link>
              </SidebarMenuButton>
              <CollapsibleTrigger asChild>
                <SidebarMenuAction>
                  <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  <span className="sr-only">{t("nav.toggle")}</span>
                </SidebarMenuAction>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {teams.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">{t("nav.noTeams")}</p>
                  ) : (
                    teams.map((team) => (
                      <SidebarMenuSubItem key={team.id}>
                        <SidebarMenuSubButton asChild isActive={pathname === `/teams/${team.id}`}>
                          <Link to="/teams/$teamId" params={{ teamId: team.id }}>
                            <Users />
                            <span className="truncate">{team.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))
                  )}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>

          {/* The people you share songs with (issue #77). */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith("/people")} tooltip={t("nav.people")}>
              <Link to="/people">
                <Contact />
                <span>{t("nav.people")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      {canReview || isGlobalAdmin ? (
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {canReview ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/review")} tooltip={t("nav.review")}>
                  <Link to="/review">
                    <ClipboardCheck />
                    <span>{t("nav.review")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
            {isGlobalAdmin ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")} tooltip={t("nav.admin")}>
                  <Link to="/admin">
                    <ShieldCheck />
                    <span>{t("nav.admin")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
    </SidebarContent>
  );
}

function AdminNav({ pathname }: { pathname: string }) {
  const { t } = useTranslation();
  const sections = [
    { to: "/admin/users" as const, label: t("nav.adminUsers"), icon: Users },
    { to: "/admin/auth" as const, label: t("nav.adminAuth"), icon: KeyRound },
    { to: "/admin/storage" as const, label: t("nav.adminStorage"), icon: Database },
    { to: "/admin/catalogs" as const, label: t("nav.adminCatalogs"), icon: FileStack },
    { to: "/admin/metadata" as const, label: t("nav.adminMetadata"), icon: LayoutDashboard },
  ];

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("nav.backToApp")}>
              <Link to="/library">
                <ArrowLeft />
                <span>{t("nav.backToApp")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>{t("nav.admin")}</SidebarGroupLabel>
        <SidebarMenu>
          {sections.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={pathname.startsWith(item.to)} tooltip={item.label}>
                <Link to={item.to}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
