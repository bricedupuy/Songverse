import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
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
import { cn } from "#/lib/utils";

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
              <AccountMenuContent session={session} side="top" align="end" />
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/** The account menu (your name, at the bottom of the sidebar): dashboard, settings, offline, help, sign out. */
export function AccountMenuContent({ session, side, align }: { session: AppSession; side: "top" | "right"; align: "start" | "end" }) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
      <DropdownMenuContent align={align} side={side} className="w-60">
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

interface NavItem {
  key: string;
  label: string;
  isActive: boolean;
  icon?: ReactNode;
  muted?: boolean;
  link: { to: NonNullable<LinkProps["to"]>; params?: Record<string, string>; search?: object };
}

/**
 * A sidebar entry with its own list under it (Library, Sets, Songbooks,
 * Teams), as a collapsible list: the phone's sidebar. On a wider screen the
 * lists are in the nested sidebar's panel instead (#80).
 */
function NavGroup({
  icon,
  label,
  to,
  isActive,
  items,
  empty,
  testId,
}: {
  icon: ReactNode;
  label: string;
  to: NavItem["link"]["to"];
  isActive: boolean;
  items: NavItem[];
  empty?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
          <Link to={to}>
            {icon}
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction>
            <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
            <span className="sr-only">{t("nav.toggle")}</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub data-testid={testId}>
            {items.length === 0 && empty ? <p className="px-2 py-1 text-xs text-muted-foreground">{empty}</p> : null}
            {items.map((item) => (
              <SidebarMenuSubItem key={item.key}>
                <SidebarMenuSubButton asChild isActive={item.isActive}>
                  <Link {...(item.link as LinkProps)} className={cn(item.muted && "text-muted-foreground")}>
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
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
          <NavGroup
            icon={<Music2 />}
            label={t("nav.library")}
            to="/library"
            isActive={pathname.startsWith("/library")}
            testId="library-sections"
            items={[
              // Songs (what Library opens on), artists, and the user's smart lists (issue #58).
              { key: "songs", label: t("nav.songs"), isActive: pathname === "/library" && !listId, link: { to: "/library" } },
              { key: "artists", label: t("nav.artists"), isActive: pathname === "/library/artists", link: { to: "/library/artists" as const } },
              ...smartLists.map((list) => ({
                key: list.id,
                label: list.name,
                icon: <ListFilter className="size-3.5" />,
                isActive: pathname === "/library" && listId === list.id,
                link: { to: "/library" as const, search: smartListSearch(list) },
              })),
            ]}
          />
          <NavGroup
            icon={<ListMusic />}
            label={t("nav.sets")}
            to="/sets"
            isActive={pathname.startsWith("/sets")}
            empty={t("sets.noSetsYet")}
            items={[
              ...shownSetlists.map((set) => ({
                key: set.id,
                label: setlistTitle(set, t, i18n.language),
                isActive: pathname === `/sets/${set.id}`,
                link: { to: "/sets/$setlistId" as const, params: { setlistId: set.id } },
              })),
              ...(setlists.length > shownSetlists.length
                ? [{ key: "all", label: t("sets.viewAll", { count: setlists.length }), muted: true, isActive: false, link: { to: "/sets" as const } }]
                : []),
            ]}
          />
          <NavGroup
            icon={<BookOpen />}
            label={t("nav.songbooks")}
            to="/songbooks"
            isActive={pathname.startsWith("/songbooks")}
            empty={t("songbooks.noSongbooksYet")}
            items={songbooks.map((songbook) => ({
              key: songbook.id,
              label: songbook.name,
              isActive: pathname === `/songbooks/${songbook.id}`,
              link: { to: "/songbooks/$songbookId" as const, params: { songbookId: songbook.id } },
            }))}
          />
          <NavGroup
            icon={<UsersRound />}
            label={t("nav.teams")}
            to="/teams"
            isActive={pathname.startsWith("/teams")}
            empty={t("nav.noTeams")}
            items={teams.map((team) => ({
              key: team.id,
              label: team.name,
              icon: <Users />,
              isActive: pathname === `/teams/${team.id}`,
              link: { to: "/teams/$teamId" as const, params: { teamId: team.id } },
            }))}
          />

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
