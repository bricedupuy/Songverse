import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { useMatches, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "#/components/app-sidebar";
import { OfflineBanner } from "#/components/offline-banner";
import { SiteHeader } from "#/components/site-header";
import { StemDockSlot, StemReturnButton } from "#/components/stem-dock";
import { YouTubeHost } from "#/components/youtube-dock";
import { unloadStems } from "#/lib/stem-engine";
import type { AppSession } from "#/lib/server-auth";
import { nestedSidebarFor } from "#/lib/sidebar-kind";
import { NestedSidebar } from "#/components/nested-sidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "#/components/ui/sidebar";

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
        <ShellSidebar session={session} teams={teams} songbooks={songbooks} setlists={setlists} />
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

/**
 * The full sidebar on a phone (in a sheet) and on a section's own page;
 * inside a section, on a wider screen, the rail and its panel (issue #80).
 */
function ShellSidebar(props: { session: AppSession; teams: TeamSummary[]; songbooks: SongbookSummary[]; setlists: SetlistSummary[] }) {
  const { isMobile } = useSidebar();
  const nested = useRouterState({ select: (s) => nestedSidebarFor(s.location.pathname, s.location.search as Record<string, unknown>) });
  return isMobile || !nested ? <AppSidebar {...props} /> : <NestedSidebar {...props} />;
}
