import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { useMatches } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "#/components/app-sidebar";
import { OfflineBanner } from "#/components/offline-banner";
import { SiteHeader } from "#/components/site-header";
import { StemDockSlot, StemReturnButton } from "#/components/stem-dock";
import { YouTubeHost } from "#/components/youtube-dock";
import { unloadStems } from "#/lib/stem-engine";
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
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  // Signed out (or out of the app): the stems stop.
  useEffect(() => unloadStems, []);
  if (fullScreen) {
    return (
      <>
        {children}
        <StemReturnButton />
        <YouTubeHost />
      </>
    );
  }
  return (
    <StemDockSlot.Provider value={dockSlot}>
      <SidebarProvider>
        <AppSidebar session={session} teams={teams} songbooks={songbooks} setlists={setlists} />
        <SidebarInset>
          <SiteHeader />
          <OfflineBanner />
          <div className="flex-1 px-4 py-8 md:px-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </div>
          {/* A song's stem player docks here, at the bottom of the screen (issue #64). */}
          <div ref={setDockSlot} className="sticky bottom-0 z-30 empty:hidden" />
        </SidebarInset>
      </SidebarProvider>
      <StemReturnButton />
      <YouTubeHost />
    </StemDockSlot.Provider>
  );
}
