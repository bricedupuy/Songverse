import { createFileRoute, redirect } from "@tanstack/react-router";

// Account settings now live on the dashboard; kept so old links and
// bookmarks still land somewhere useful.
export const Route = createFileRoute("/_protected/account")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", hash: "settings", replace: true });
  },
});
