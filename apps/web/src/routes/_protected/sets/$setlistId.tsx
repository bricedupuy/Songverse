import { ApiError, type SetlistDetail, type SetlistItem } from "@songverse/core";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { apiClient } from "#/lib/api-client";
import { formatSetDate, setlistTitle } from "#/lib/setlists";
import { AddSongs } from "./-add-songs";
import { SetSongList } from "./-set-song-list";

export const Route = createFileRoute("/_protected/sets/$setlistId")({
  // Null when the set doesn't exist or isn't visible to this user (the API
  // doesn't tell the two apart).
  loader: ({ params }) =>
    apiClient.getSetlist(params.setlistId).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
  component: SetRoute,
});

function SetRoute() {
  const { t } = useTranslation();
  const loaded = Route.useLoaderData();
  if (!loaded) {
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
  return <SetPage loaded={loaded} />;
}

function SetPage({ loaded }: { loaded: SetlistDetail }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [set, setSet] = useState<SetlistDetail>(loaded);
  const [error, setError] = useState<string | null>(null);

  // Re-sync after navigating to another set or a router.invalidate().
  useEffect(() => setSet(loaded), [loaded]);

  /** Every item mutation returns the updated set. */
  async function apply(change: Promise<SetlistDetail>, rollback?: SetlistDetail) {
    setError(null);
    try {
      setSet(await change);
    } catch (err) {
      if (rollback) setSet(rollback);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function reorder(items: SetlistItem[]) {
    const previous = set;
    setSet({ ...set, items });
    void apply(
      apiClient.reorderSetlistItems(
        set.id,
        items.map((item) => item.id),
      ),
      previous,
    );
  }

  const subtitle = [
    set.name && set.eventDate ? formatSetDate(set.eventDate, i18n.language, "long") : null,
    set.teamName ?? t("sets.personal"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{setlistTitle(set, t, i18n.language)}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {!set.canEdit ? <p className="text-sm text-muted-foreground">{t("sets.readOnly")}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("sets.songs")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {set.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sets.emptySet")}</p>
          ) : (
            <SetSongList
              items={set.items}
              canEdit={set.canEdit}
              onReorder={reorder}
              onChangeItem={(itemId, change) => void apply(apiClient.updateSetlistItem(set.id, itemId, change))}
              onRemoveItem={(itemId) => void apply(apiClient.removeSetlistItem(set.id, itemId))}
            />
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {set.canEdit ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("sets.addSongs")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AddSongs set={set} onAdded={setSet} />
            </CardContent>
          </Card>
          <DetailsCard
            set={set}
            onSaved={async (updated) => {
              setSet(updated);
              // The sidebar lists sets by title.
              await router.invalidate();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function DetailsCard({ set, onSaved }: { set: SetlistDetail; onSaved: (set: SetlistDetail) => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState(set.name ?? "");
  const [eventDate, setEventDate] = useState(set.eventDate ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setName(set.name ?? "");
    setEventDate(set.eventDate ?? "");
  }, [set.id, set.name, set.eventDate]);

  const dirty = name.trim() !== (set.name ?? "") || eventDate !== (set.eventDate ?? "");

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      await onSaved(await apiClient.updateSetlist(set.id, { name: name.trim() || null, eventDate: eventDate || null }));
      setMessage({ kind: "ok", text: t("sets.saved") });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      await apiClient.deleteSetlist(set.id);
      await router.invalidate();
      await navigate({ to: "/sets" });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      setPending(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("sets.details")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="set-date">{t("sets.dateLabel")}</Label>
              <Input id="set-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="set-name">{t("sets.nameLabel")}</Label>
              <Input
                id="set-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder={eventDate ? formatSetDate(eventDate, i18n.language, "long") : t("sets.untitled")}
              />
            </div>
          </div>
          {message ? (
            <p className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message.text}</p>
          ) : null}
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? t("sets.saving") : t("sets.save")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
              {t("sets.deleteSet")}
            </Button>
          </div>
        </form>
      </CardContent>

      <Dialog open={confirmingDelete} onOpenChange={(open) => !pending && setConfirmingDelete(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sets.confirmDelete")}</DialogTitle>
            <DialogDescription>{t("sets.confirmDeleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={pending}>
              {t("sets.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={pending}>
              {pending ? t("sets.deleting") : t("sets.deleteSet")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
