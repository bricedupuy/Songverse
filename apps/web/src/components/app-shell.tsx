import type { SongbookSummary, TeamSummary } from "@songverse/core";
import type { ReactNode } from "react";
import { AppSidebar } from "#/components/app-sidebar";
import { SiteHeader } from "#/components/site-header";
import type { AppSession } from "#/lib/server-auth";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";

export function AppShell({
  session,
  teams,
  songbooks,
  children,
}: {
  session: AppSession;
  teams: TeamSummary[];
  songbooks: SongbookSummary[];
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar session={session} teams={teams} songbooks={songbooks} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 px-4 py-8 md:px-6">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
