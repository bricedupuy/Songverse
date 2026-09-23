import { createFileRoute } from "@tanstack/react-router";
import { SongEditor } from "#/components/song-editor/song-editor";
import { apiClient } from "#/lib/api-client";
import { parseSongSearch } from "./-song-search";

export const Route = createFileRoute("/_protected/library/new")({
  validateSearch: parseSongSearch,
  loader: async () => ({ tags: await apiClient.listTags() }),
  component: NewSong,
});

function NewSong() {
  const { tags } = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SongEditor
      mode="create"
      tags={tags}
      tab={tab ?? "info"}
      onTabChange={(next) => void navigate({ search: { tab: next === "info" ? undefined : next }, replace: true })}
    />
  );
}
