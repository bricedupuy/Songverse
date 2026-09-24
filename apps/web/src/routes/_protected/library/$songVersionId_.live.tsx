import { findKeptSong, renderChart, type CapoDisplayModeValue, type ChordNotationValue, type SongDocumentV2 } from "@songverse/core";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LiveView } from "#/components/live-view";
import { apiClient } from "#/lib/api-client";
import { artistNames } from "#/lib/artists";
import { setMode } from "#/lib/mode";
import { isNetworkError } from "#/lib/offline";
import { keptSets, onlineOrKept } from "#/lib/offline-data";

/** What playing a song on its own needs: from the library online, from a kept set offline. */
export interface LoneSong {
  id: string;
  title: string;
  artists: string | null;
  document: SongDocumentV2;
  capo: number | null;
  notation: ChordNotationValue;
  capoDisplay: CapoDisplayModeValue;
}

/**
 * A song on its own, full screen, in Live mode (issue #48): one the leader
 * calls that isn't in the set, pulled up with the search. `back` is where
 * it was pulled up from, which the × returns to. Offline, any song in a
 * set kept on the device (issue #50).
 */
export const Route = createFileRoute("/_protected/library/$songVersionId_/live")({
  staticData: { fullScreen: true },
  // Only a path in the app: never another site.
  validateSearch: (search: Record<string, unknown>): { back?: string } =>
    typeof search.back === "string" && search.back.startsWith("/") && !search.back.startsWith("//") ? { back: search.back } : {},
  loader: ({ params }) =>
    onlineOrKept<LoneSong>(
      async () => {
        const [version, me] = await Promise.all([
          apiClient.getSongVersion(params.songVersionId).catch((error: unknown) => {
            if (isNetworkError(error)) throw error;
            return null;
          }),
          apiClient.getMe(),
        ]);
        if (!version) throw redirect({ to: "/library" });
        return {
          id: version.id,
          title: version.title,
          artists: artistNames(version.artists),
          document: version.documentJson,
          capo: version.capo,
          notation: me.chordNotation,
          capoDisplay: me.capoDisplayMode,
        };
      },
      async () => {
        const kept = findKeptSong(await keptSets(), params.songVersionId);
        const song = kept?.view.song;
        if (!kept || !song) return undefined;
        return {
          id: song.id,
          title: song.title,
          artists: null,
          document: song.document,
          capo: song.suggestedCapo,
          notation: kept.view.view.chordNotation,
          capoDisplay: kept.view.view.capoDisplayMode,
        };
      },
    ),
  component: SongLiveRoute,
});

function SongLiveRoute() {
  const song = Route.useLoaderData();
  const { back } = Route.useSearch();
  useEffect(() => setMode("live"), []);
  return <SongLiveView song={song} back={back} />;
}

function SongLiveView({ song, back }: { song: LoneSong; back: string | undefined }) {
  const { t } = useTranslation();
  const router = useRouter();
  // As written, through the player's own chord settings.
  const chart = useMemo(
    () =>
      renderChart(song.document, null, {
        notation: song.notation === "SOLFEGE" ? "solfege" : "english",
        capoDisplay: song.capoDisplay === "FINGERED" ? "shapes" : "sounding",
        suggestedCapo: song.capo,
      }),
    [song],
  );
  return (
    <LiveView
      song={{
        id: song.id,
        title: song.title,
        context: song.artists,
        chart,
        durationSeconds: song.document.defaults.durationSeconds,
        arrangementName: null,
        notes: [],
        exit: {
          label: t("live.back"),
          go: () => (back ? router.history.push(back) : void router.navigate({ to: "/library/$songVersionId", params: { songVersionId: song.id } })),
        },
        previous: null,
        next: null,
        nextLabel: null,
      }}
    />
  );
}
