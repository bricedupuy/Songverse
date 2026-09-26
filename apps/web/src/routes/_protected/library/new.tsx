import { createFileRoute } from "@tanstack/react-router";
import { SongEditor } from "#/components/song-editor/song-editor";
import { apiClient } from "#/lib/api-client";
import { parseSongSearch } from "./-song-search";

export const Route = createFileRoute("/_protected/library/new")({
  validateSearch: parseSongSearch,
  loaderDeps: ({ search }) => ({ linkTo: search.linkTo }),
  loader: async ({ deps }) => ({
    tags: await apiClient.listTags(),
    // "Add a translation" on a song (issue #78): this one is linked to it.
    linkTo: deps.linkTo ? await apiClient.getSongVersion(deps.linkTo).catch(() => null) : null,
  }),
  component: NewSong,
});

function NewSong() {
  const { tags, linkTo } = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SongEditor
      mode="create"
      tags={tags}
      linkTo={linkTo ? { id: linkTo.id, label: linkTo.title } : undefined}
      tab={tab ?? "info"}
      onTabChange={(next) => void navigate({ search: { tab: next === "info" ? undefined : next }, replace: true })}
    />
  );
}
