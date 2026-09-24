import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { RouteError } from "#/components/route-error";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultErrorComponent: RouteError,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    /** Drawn on its own, without the sidebar and header (Live's full-screen songs). */
    fullScreen?: boolean;
  }
}
