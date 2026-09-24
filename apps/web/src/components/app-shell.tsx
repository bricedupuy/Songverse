import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppSidebar } from "#/components/app-sidebar";
import { OfflineBanner } from "#/components/offline-banner";
import { SiteHeader } from "#/components/site-header";
import type { AppSession } from "#/lib/server-auth";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";

export function AppShell({
  session,
  teams,
  songbooks,
  setlists,
  children,
}: {
  session: AppSession;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
  setlists: SetlistSummary[];
  children: ReactNode;
}) {
  const fullScreen = useMatches({ select: (matches) => matches.some((match) => match.staticData.fullScreen) });
  if (fullScreen) return children;
  return (
    <SidebarProvider>
      <AppSidebar session={session} teams={teams} songbooks={songbooks} setlists={setlists} />
      <SidebarInset>
        <SiteHeader />
        <OfflineBanner />
        <div className="flex-1 px-4 py-8 md:px-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
