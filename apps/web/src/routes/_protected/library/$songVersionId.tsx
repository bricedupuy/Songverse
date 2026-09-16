import { createFileRoute, useRouter } from "@tanstack/react-router";
import { apiClient } from "#/lib/api-client";
import { MusicBrainzMatchPanel } from "#/components/musicbrainz-match-panel";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/_protected/library/$songVersionId")({
  loader: async ({ params }) => {
    const version = await apiClient.getSongVersion(params.songVersionId);
    const [work, recordingMatch] = await Promise.all([
      apiClient.getWork(version.workId),
      apiClient.getSongVersionMusicBrainz(version.id),
    ]);
    const workMatch = await apiClient.getWorkMusicBrainz(work.id);
    return { version, work, recordingMatch, workMatch };
  },
  component: SongVersionDetail,
});

function SongVersionDetail() {
  const { version, work, recordingMatch, workMatch } = Route.useLoaderData();
  const router = useRouter();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{version.title}</h1>
        <p className="text-sm text-muted-foreground">
          {version.language} · {version.publicationState}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">MusicBrainz recording (artist, album)</CardTitle>
        </CardHeader>
        <CardContent>
          <MusicBrainzMatchPanel
            kind="recording"
            initialQuery={version.title}
            current={recordingMatch}
            onSearch={(t, a) => apiClient.searchMusicBrainzRecordings(t, a)}
            onLink={async (mbid) => {
              await apiClient.linkSongVersionMusicBrainz(version.id, mbid);
              await router.invalidate();
            }}
            onUnlink={async () => {
              await apiClient.unlinkSongVersionMusicBrainz(version.id);
              await router.invalidate();
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">MusicBrainz work (composition, ISWC)</CardTitle>
        </CardHeader>
        <CardContent>
          <MusicBrainzMatchPanel
            kind="work"
            initialQuery={version.title}
            current={workMatch}
            onSearch={(t) => apiClient.searchMusicBrainzWorks(t)}
            onLink={async (mbid) => {
              await apiClient.linkWorkMusicBrainz(work.id, mbid);
              await router.invalidate();
            }}
            onUnlink={async () => {
              await apiClient.unlinkWorkMusicBrainz(work.id);
              await router.invalidate();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
