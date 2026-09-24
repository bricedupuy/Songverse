import { renderChart, type SongVersionDetail, type UserProfile } from "@songverse/core";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LiveView } from "#/components/live-view";
import { apiClient } from "#/lib/api-client";
import { artistNames } from "#/lib/artists";
import { setMode } from "#/lib/mode";

/**
 * A song on its own, full screen, in Live mode (issue #48): one the leader
 * calls that isn't in the set, pulled up with the search. `back` is where
 * it was pulled up from, which the × returns to.
 */
export const Route = createFileRoute("/_protected/library/$songVersionId_/live")({
  staticData: { fullScreen: true },
  // Only a path in the app: never another site.
  validateSearch: (search: Record<string, unknown>): { back?: string } =>
    typeof search.back === "string" && search.back.startsWith("/") && !search.back.startsWith("//") ? { back: search.back } : {},
  loader: async ({ params }) => {
    const [version, me] = await Promise.all([apiClient.getSongVersion(params.songVersionId).catch(() => null), apiClient.getMe()]);
    if (!version) throw redirect({ to: "/library" });
    return { version, me };
  },
  component: SongLiveRoute,
});

function SongLiveRoute() {
  const { version, me } = Route.useLoaderData();
  const { back } = Route.useSearch();
  useEffect(() => setMode("live"), []);
  return <SongLiveView version={version} me={me} back={back} />;
}

function SongLiveView({ version, me, back }: { version: SongVersionDetail; me: UserProfile; back: string | undefined }) {
  const { t } = useTranslation();
  const router = useRouter();
  // As written, through the player's own chord settings.
  const chart = useMemo(
    () =>
      renderChart(version.documentJson, null, {
        notation: me.chordNotation === "SOLFEGE" ? "solfege" : "english",
        capoDisplay: me.capoDisplayMode === "FINGERED" ? "shapes" : "sounding",
        suggestedCapo: version.capo,
      }),
    [version, me],
  );
  return (
    <LiveView
      song={{
        id: version.id,
        title: version.title,
        context: artistNames(version.artists),
        chart,
        durationSeconds: version.documentJson.defaults.durationSeconds,
        arrangementName: null,
        notes: [],
        exit: {
          label: t("live.back"),
          go: () => (back ? router.history.push(back) : void router.navigate({ to: "/library/$songVersionId", params: { songVersionId: version.id } })),
        },
        previous: null,
        next: null,
        nextLabel: null,
      }}
    />
  );
}
