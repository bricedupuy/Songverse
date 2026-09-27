import { ApiError, keptSetSong, onlineOrKept, type SetlistSongView } from "@songverse/core";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LiveView, type LiveSong } from "#/components/live-view";
import { renderPlayerChart } from "#/components/player-chart";
import { Button } from "#/components/ui/button";
import { apiClient } from "#/lib/api-client";
import { deviceStorage, useKeepSet } from "#/lib/offline-data";
import { setMode } from "#/lib/mode";
import { setlistTitle } from "#/lib/setlists";
import { useSongView } from "#/lib/song-views";
import { useSyncSong } from "#/lib/sync-client";

/** One song of a set, full screen, in Live mode (components/live-view.tsx). */
export const Route = createFileRoute("/_protected/sets/$setlistId_/live/$itemId")({
  staticData: { fullScreen: true },
  // Null when the set or song doesn't exist or isn't visible to this user.
  // Offline, from the set kept on the device (issue #50).
  loader: ({ params }) =>
    onlineOrKept(
      () =>
        apiClient.getSetlistSong(params.setlistId, params.itemId).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }),
      () => keptSetSong(deviceStorage(), params.setlistId, params.itemId),
    ),
  component: LiveRoute,
});

function LiveRoute() {
  const { t } = useTranslation();
  const view = Route.useLoaderData();
  // Kept on the device as it's opened, to play offline (issue #50).
  useKeepSet(view?.set.id);

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
  return <SetLiveView view={view} />;
}

function SetLiveView({ view }: { view: SetlistSongView }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { set, item, song } = view;
  useSongView(song?.id);
  // Sync play (issue #13): the leader's song, followed.
  useSyncSong(set.id, item.id, (itemId) => void navigate({ to: "/sets/$setlistId/live/$itemId", params: { setlistId: set.id, itemId } }));
  const goTo = (itemId: string | null) =>
    itemId ? () => void navigate({ to: "/sets/$setlistId/live/$itemId", params: { setlistId: set.id, itemId } }) : null;

  const live: LiveSong = {
    id: item.id,
    title: song?.title ?? t("sets.hiddenSong"),
    artist: song?.artists?.join(", ") || null,
    setName: setlistTitle(set, t, i18n.language),
    setId: set.id,
    chartFor: (extraSteps) =>
      song ? renderPlayerChart(view, undefined, undefined, undefined, extraSteps) : null,
    keyShift: (view.arrangement?.document.defaults.transposeSteps ?? 0) + item.transposeSteps,
    durationSeconds: song?.document.defaults.durationSeconds,
    arrangementName: view.arrangement?.name ?? null,
    // A copy kept before #59 has none.
    references: view.songbookReferences ?? [],
    notes: [...(item.notes ? [{ text: item.notes }] : []), ...(view.myNote ? [{ label: t("sets.myNotes"), text: view.myNote }] : [])],
    exit: { label: t("live.backToSet"), go: () => void navigate({ to: "/sets/$setlistId", params: { setlistId: set.id } }) },
    previous: goTo(view.previousItemId),
    next: goTo(view.nextItemId),
    nextLabel: view.nextItemId ? (view.nextTitle ? t("live.nextUp", { title: view.nextTitle }) : t("live.nextHidden")) : t("live.endOfSet"),
  };
  return <LiveView song={live} />;
}
