import type { SongbookSummary, TeamSummary } from "@songverse/core";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Database,
  FileStack,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Music2,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "#/lib/auth-client";
import type { AppSession } from "#/lib/server-auth";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { sizedAvatarUrl } from "#/lib/avatar-url";
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

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function AppSidebar({
  session,
  teams,
  songbooks,
}: {
  session: AppSession;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
}) {
  const { t } = useTranslation();
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
        <MainNav pathname={pathname} teams={teams} songbooks={songbooks} isGlobalAdmin={session.isGlobalAdmin} />
      )}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12">
                  <Avatar className="size-6 shrink-0">
                    {session.avatarUrl ? <AvatarImage src={sizedAvatarUrl(session.avatarUrl, 24)} alt="" /> : null}
                    <AvatarFallback className="text-[10px]">{initials(session.displayName)}</AvatarFallback>
                  </Avatar>
                  <SidebarLabel className="flex-1 truncate text-left">{session.displayName}</SidebarLabel>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel>
                  <p className="font-medium">{session.displayName}</p>
                  <p className="text-xs font-normal text-muted-foreground">{session.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard />
                    {t("nav.dashboard")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account">
                    <KeyRound />
                    {t("nav.account")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    void authClient.signOut().then(() => {
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
  isGlobalAdmin,
}: {
  pathname: string;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
  isGlobalAdmin: boolean;
}) {
  const { t } = useTranslation();

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{t("nav.platform")}</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith("/library")} tooltip={t("nav.library")}>
              <Link to="/library">
                <Music2 />
                <span>{t("nav.library")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

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
        </SidebarMenu>
      </SidebarGroup>

      {isGlobalAdmin ? (
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")} tooltip={t("nav.admin")}>
                <Link to="/admin">
                  <ShieldCheck />
                  <span>{t("nav.admin")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
