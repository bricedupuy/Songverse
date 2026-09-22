import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/**
 * Layout route for everything under /admin/* - the sidebar swaps its
 * whole nav to Users/Storage/Catalogs/Metadata while any of these are
 * active (see AppSidebar's AdminNav).
 */
export const Route = createFileRoute("/_protected/admin")({
  beforeLoad: ({ context }) => {
    if (!context.session.isGlobalAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
