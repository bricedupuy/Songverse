import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/** The review queue for the global catalogue: reviewers and global admins only. */
export const Route = createFileRoute("/_protected/review")({
  beforeLoad: ({ context }) => {
    if (!context.session.isGlobalAdmin && !context.session.isReviewer) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
