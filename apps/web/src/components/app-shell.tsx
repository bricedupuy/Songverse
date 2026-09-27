import type { SetlistSummary, SongbookSummary, TeamSummary } from "@songverse/core";
import { useMatches, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "#/components/app-sidebar";
import { OfflineBanner } from "#/components/offline-banner";
import { SiteHeader } from "#/components/site-header";
import { MetronomeReturnButton } from "#/components/metronome";
import { StemDockSlot, StemReturnButton } from "#/components/stem-dock";
import { YouTubeHost } from "#/components/youtube-dock";
import { stopMetronome } from "#/lib/metronome-engine";
import { useRecordingClickBridge } from "#/lib/recording-click";
import { useSyncBridge } from "#/lib/sync-client";
import { unloadStems } from "#/lib/stem-engine";
import type { AppSession } from "#/lib/server-auth";
import { nestedSidebarFor } from "#/lib/sidebar-kind";
import { ItemPanel, NestedSidebar } from "#/components/nested-sidebar";
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
  // Sync play (issue #13): back on after a reload; the leader's metronome sent out.
  useSyncBridge();
  // The metronome with the recording (issue #100).
  useRecordingClickBridge();
  // Signed out (or out of the app): the stems and the metronome stop.
  useEffect(
    () => () => {
      unloadStems();
      stopMetronome();
    },
    [],
  );
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
      <MetronomeReturnButton />
      <YouTubeHost />
    </StemDockSlot.Provider>
  );
}

/**
 * The full sidebar on a section's pages and lists; on one item, the rail
 * and its panel on a wider screen, and on a phone a sheet that opens on the
 * item's list and switches to the full sidebar (issue #80).
 */
function ShellSidebar(props: { session: AppSession; teams: TeamSummary[]; songbooks: SongbookSummary[]; setlists: SetlistSummary[] }) {
  const { isMobile } = useSidebar();
  const nested = useRouterState({ select: (s) => nestedSidebarFor(s.location.pathname) });
  if (!nested) return <AppSidebar {...props} />;
  // On a phone the sheet switches between the item's list and the full sidebar, rather than nesting them.
  return isMobile ? <AppSidebar {...props} itemPanel={<ItemPanel teams={props.teams} songbooks={props.songbooks} setlists={props.setlists} />} /> : <NestedSidebar {...props} />;
}
