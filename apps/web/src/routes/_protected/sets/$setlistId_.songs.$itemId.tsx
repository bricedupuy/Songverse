import { ApiError, transposeKey, type SetlistSongView } from "@songverse/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayerChart } from "#/components/player-chart";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { apiClient } from "#/lib/api-client";
import { setlistTitle, transposeLabel } from "#/lib/setlists";

/**
 * One song of a set, readable by anyone who can open the set - guests
 * included, and songs that aren't in the viewer's own library - with the
 * viewer's private notes and a way through the set in order.
 */
export const Route = createFileRoute("/_protected/sets/$setlistId_/songs/$itemId")({
  // Null when the set or song doesn't exist or isn't visible to this user.
  loader: ({ params }) =>
    apiClient.getSetlistSong(params.setlistId, params.itemId).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
  component: SetSongRoute,
});

function SetSongRoute() {
  const { t } = useTranslation();
  const view = Route.useLoaderData();
  if (!view) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-semibold">{t("sets.notFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("sets.notFoundDescription")}</p>
        <Button asChild variant="outline">
          <Link to="/sets">{t("sets.backToSets")}</Link>
        </Button>
      </div>
    );
  }
  return <SetSongPage view={view} />;
}

function SetSongPage({ view }: { view: SetlistSongView }) {
  const { t, i18n } = useTranslation();
  const { set, item, song } = view;

  // The arrangement's key and tempo, with the set's own key on top.
  const arrangement = view.arrangement?.document.defaults;
  const tempo = arrangement?.tempo ?? song?.tempo;
  const details = [
    t("sets.songOfSet", { position: item.position + 1, count: set.itemCount }),
    // The set's own transposition, from the arrangement's key.
    song ? transposeLabel(song.key && arrangement ? (transposeKey(song.key, arrangement.transposeSteps) ?? song.key) : song.key, item.transposeSteps, t) : null,
    view.arrangement ? t("sets.playedAs", { name: view.arrangement.name }) : null,
    tempo ? `${tempo} BPM` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/sets/$setlistId"
        params={{ setlistId: set.id }}
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {setlistTitle(set, t, i18n.language)}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold">{song?.title ?? t("sets.hiddenSong")}</h1>
          <p className="text-sm text-muted-foreground">{details}</p>
          {view.sharedBy ? (
            <div>
              <Badge variant="muted">{t("sets.sharedBy", { name: view.sharedBy.displayName })}</Badge>
            </div>
          ) : null}
        </div>
        {song && view.inLibrary ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/library/$songVersionId" params={{ songVersionId: song.id }}>
              {t("sets.openInLibrary")}
            </Link>
          </Button>
        ) : null}
      </div>

      {song ? (
        <Card>
          <CardContent>
            <PlayerChart view={view} />
          </CardContent>
        </Card>
      ) : null}

      {item.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("sets.setNotes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <MyNotesCard view={view} />

      <nav className="flex items-center justify-between gap-3" aria-label={t("sets.songs")}>
        {view.previousItemId ? (
          <Button asChild variant="outline">
            <Link to="/sets/$setlistId/songs/$itemId" params={{ setlistId: set.id, itemId: view.previousItemId }}>
              <ChevronLeft />
              {t("sets.previousSong")}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {view.nextItemId ? (
          <Button asChild variant="outline">
            <Link to="/sets/$setlistId/songs/$itemId" params={{ setlistId: set.id, itemId: view.nextItemId }}>
              {t("sets.nextSong")}
              <ChevronRight />
            </Link>
          </Button>
        ) : null}
      </nav>
    </div>
  );
}

function MyNotesCard({ view }: { view: SetlistSongView }) {
  const { t } = useTranslation();
  const [text, setText] = useState(view.myNote);
  const [saved, setSaved] = useState(view.myNote);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Moving to another song of the set reuses this component.
  useEffect(() => {
    setText(view.myNote);
    setSaved(view.myNote);
    setMessage(null);
  }, [view.item.id, view.myNote]);

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const { myNote } = await apiClient.setSetlistNote(view.set.id, view.item.id, text);
      setText(myNote);
      setSaved(myNote);
      setMessage({ kind: "ok", text: t("sets.saved") });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("sets.myNotes")}</CardTitle>
        <CardDescription>{t("sets.myNotesHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Label htmlFor="my-notes" className="sr-only">
            {t("sets.myNotes")}
          </Label>
          <Textarea
            id="my-notes"
            value={text}
            maxLength={5000}
            rows={4}
            placeholder={t("sets.myNotesPlaceholder")}
            onChange={(event) => {
              setText(event.target.value);
              setMessage(null);
            }}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || text.trim() === saved}>
              {pending ? t("sets.saving") : t("sets.saveNotes")}
            </Button>
            {message ? (
              <p className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message.text}</p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
