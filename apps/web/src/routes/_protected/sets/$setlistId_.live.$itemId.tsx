import { ApiError } from "@songverse/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LiveView } from "#/components/live-view";
import { Button } from "#/components/ui/button";
import { apiClient } from "#/lib/api-client";
import { setMode } from "#/lib/mode";

/** One song of a set, full screen, in Live mode (components/live-view.tsx). */
export const Route = createFileRoute("/_protected/sets/$setlistId_/live/$itemId")({
  staticData: { fullScreen: true },
  // Null when the set or song doesn't exist or isn't visible to this user.
  loader: ({ params }) =>
    apiClient.getSetlistSong(params.setlistId, params.itemId).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
  component: LiveRoute,
});

function LiveRoute() {
  const { t } = useTranslation();
  const view = Route.useLoaderData();

  // Opened from a link, it's Live mode from here on.
  useEffect(() => setMode("live"), []);

  if (!view) {
    return (
      <div className="flex min-h-dvh flex-col items-start gap-4 bg-background p-6 text-foreground">
        <h1 className="text-2xl font-semibold">{t("sets.notFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("sets.notFoundDescription")}</p>
        <Button asChild variant="outline">
          <Link to="/sets">{t("sets.backToSets")}</Link>
        </Button>
      </div>
    );
  }
  return <LiveView view={view} />;
}
