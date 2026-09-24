import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrangementEditor } from "#/components/arrangement-editor";
import { apiClient } from "#/lib/api-client";

/** One arrangement of a song: opened (and changed, by those who can) apart from the song itself. */
export const Route = createFileRoute("/_protected/library/$songVersionId_/arrangements/$arrangementId")({
  loader: async ({ params }) => {
    const [arrangement, version] = await Promise.all([
      apiClient.getArrangement(params.arrangementId).catch(() => null),
      apiClient.getSongVersion(params.songVersionId).catch(() => null),
    ]);
    if (!version) throw redirect({ to: "/library" });
    if (!arrangement || arrangement.songVersionId !== version.id) {
      throw redirect({ to: "/library/$songVersionId", params: { songVersionId: version.id }, search: { tab: "arrangements" } });
    }
    return { arrangement, version };
  },
  component: ArrangementPage,
});

function ArrangementPage() {
  const { arrangement, version } = Route.useLoaderData();
  return <ArrangementEditor key={arrangement.id} initial={arrangement} version={version} />;
}
