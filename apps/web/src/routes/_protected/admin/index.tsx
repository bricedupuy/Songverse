import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users" });
  },
});
