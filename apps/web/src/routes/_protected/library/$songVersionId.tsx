import { isNetworkError, onlineOrKept } from "@songverse/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadOfflineSong, OfflineSongPage, type OfflineSong } from "#/components/offline-song-page";
import { SongEditor } from "#/components/song-editor/song-editor";
import { apiClient } from "#/lib/api-client";
import { parseNotices, parseSongSearch } from "./-song-search";

export const Route = createFileRoute("/_protected/library/$songVersionId")({
  validateSearch: parseSongSearch,
  // Offline, a kept song's read-only page instead (issue #52).
  loader: ({ params }) =>
    onlineOrKept<{ online: Awaited<ReturnType<typeof loadOnline>> } | { offline: OfflineSong }>(
      async () => ({ online: await loadOnline(params.songVersionId) }),
      async () => {
        const song = await loadOfflineSong(params.songVersionId);
        return song && { offline: song };
      },
    ),
  component: SongVersionPage,
});

async function loadOnline(songVersionId: string) {
  const version = await apiClient.getSongVersion(songVersionId).catch((error: unknown) => {
    if (isNetworkError(error)) throw error;
    return null;
  });
  if (!version) throw redirect({ to: "/library" });
  const [recordingMatch, workMatch, tags, songbookMemberships, attachments] = await Promise.all([
    apiClient.getSongVersionMusicBrainz(version.id).catch(() => null),
    apiClient.getWorkMusicBrainz(version.workId).catch(() => null),
    apiClient.listTags(),
    apiClient.getSongVersionSongbooks(version.id),
    apiClient.listAttachments(version.id),
  ]);
  return { version, recordingMatch, workMatch, tags, songbookMemberships, attachments };
}

function SongVersionPage() {
  const loaded = Route.useLoaderData();
  if ("offline" in loaded) return <OfflineSongPage song={loaded.offline} />;
  const data = loaded.online;
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
