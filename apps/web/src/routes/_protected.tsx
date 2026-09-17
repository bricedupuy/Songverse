import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { AppShell } from "#/components/app-shell";
import { apiClient } from "#/lib/api-client";
import { createI18n } from "#/lib/i18n";
import { getSession } from "#/lib/server-auth";

/**
 * Pathless layout route — gates every route nested under `_protected/` in
 * one place. `beforeLoad` runs on the server during SSR and on the client
 * during a soft navigation.
 */
export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/" });
    }
    const teams = await apiClient.listTeams();
    return { session, teams };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { session, teams } = Route.useRouteContext();
  // Recreated only when the locale actually changes (e.g. after the
  // dashboard's language picker triggers a router.invalidate()), not on
  // every render - see createI18n's own note on why this isn't a
  // module-level singleton.
  const i18n = useMemo(() => createI18n(session.locale), [session.locale]);

  return (
    <I18nextProvider i18n={i18n}>
      <AppShell session={session} teams={teams}>
        <Outlet />
      </AppShell>
    </I18nextProvider>
  );
}
