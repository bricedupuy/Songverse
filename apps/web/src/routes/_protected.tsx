import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
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
    return { session };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  return (
    <AppShell session={session}>
      <Outlet />
    </AppShell>
  );
}
