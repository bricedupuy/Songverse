import { createFileRoute, redirect } from "@tanstack/react-router";
import { SongEditor } from "#/components/song-editor/song-editor";
import { apiClient } from "#/lib/api-client";
import { parseNotices, parseSongSearch } from "./-song-search";

export const Route = createFileRoute("/_protected/library/$songVersionId")({
  validateSearch: parseSongSearch,
  loader: async ({ params }) => {
    const version = await apiClient.getSongVersion(params.songVersionId).catch(() => null);
    if (!version) throw redirect({ to: "/library" });
    const [recordingMatch, workMatch, tags, songbookMemberships, attachments] = await Promise.all([
      apiClient.getSongVersionMusicBrainz(version.id).catch(() => null),
      apiClient.getWorkMusicBrainz(version.workId).catch(() => null),
      apiClient.listTags(),
      apiClient.getSongVersionSongbooks(version.id),
      apiClient.listAttachments(version.id),
    ]);
    return { version, recordingMatch, workMatch, tags, songbookMemberships, attachments };
  },
  component: SongVersionPage,
});

function SongVersionPage() {
  const data = Route.useLoaderData();
  const { tab, notice } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SongEditor
      key={data.version.id}
      mode="edit"
      {...data}
      notices={parseNotices(notice)}
      tab={tab ?? "info"}
      onTabChange={(next) => void navigate({ search: { tab: next === "info" ? undefined : next }, replace: true })}
    />
  );
}
