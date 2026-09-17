import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, Music2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authClient } from "#/lib/auth-client";
import type { AppSession } from "#/lib/server-auth";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
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
  SidebarMenuButton,
  SidebarMenuItem,
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

export function AppSidebar({ session }: { session: AppSession }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  const navItems = [{ to: "/library" as const, label: t("nav.library"), icon: Music2 }];

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/library" className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <Music2 className="size-5 shrink-0" />
          {collapsed ? null : "SongVerse"}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.platform")}</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => (
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12">
                  <Avatar className="size-6 shrink-0">
                    <AvatarFallback className="text-[10px]">{initials(session.displayName)}</AvatarFallback>
                  </Avatar>
                  {collapsed ? null : <span className="flex-1 truncate text-left">{session.displayName}</span>}
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
