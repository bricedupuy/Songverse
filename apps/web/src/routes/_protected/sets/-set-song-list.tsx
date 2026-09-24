import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TRANSPOSE_STEP_OPTIONS, transposeKey, type SetlistItem, type SetlistSongRef } from "@songverse/core";
import { Link } from "@tanstack/react-router";
import { GripVertical, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { transposeLabel } from "#/lib/setlists";
import { NativeSelect } from "#/components/ui/native-select";

/** Handing shared personal songs over to a team set's team (see SongOwnershipService in the API). */
export interface OwnershipActions {
  currentUserId: string;
  onRequest: (itemId: string) => void;
  onDecide: (requestId: string, accept: boolean) => void;
}

interface SetSongListProps {
  setlistId: string;
  items: SetlistItem[];
  canEdit: boolean;
  ownership: OwnershipActions;
  onReorder: (items: SetlistItem[]) => void;
  onChangeItem: (itemId: string, change: { songVersionId?: string; transposeSteps?: number; arrangementId?: string | null }) => void;
  onRemoveItem: (itemId: string) => void;
}

export function SetSongList({ setlistId, items, canEdit, ownership, onReorder, onChangeItem, onRemoveItem }: SetSongListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    onReorder(arrayMove(items, from, to));
  }

  return (
    // A fixed id keeps dnd-kit's generated accessibility ids identical between server render and hydration.
    <DndContext id="set-song-list" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col divide-y" data-testid="set-song-list">
          {items.map((item, index) => (
            <SongRow
              key={item.id}
              setlistId={setlistId}
              item={item}
              ownership={ownership}
              index={index}
              canEdit={canEdit}
              onChange={(change) => onChangeItem(item.id, change)}
              onRemove={() => onRemoveItem(item.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function scopeLabel(song: SetlistSongRef, t: (key: string) => string): string {
  if (song.ownerScope === "GLOBAL") return t("sets.scopeGlobal");
  if (song.ownerScope === "TEAM") return song.teamName ?? "";
  return t("sets.scopePersonal");
}

function SongRow({
  setlistId,
  item,
  ownership,
  index,
  canEdit,
  onChange,
  onRemove,
}: {
  setlistId: string;
  item: SetlistItem;
  ownership: OwnershipActions;
  index: number;
  canEdit: boolean;
  onChange: (change: { songVersionId?: string; transposeSteps?: number; arrangementId?: string | null }) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });
  const song = item.song;
  const title = song?.title ?? t("sets.hiddenSong");
  // The item's own key goes on top of the arrangement's.
  const baseKey = song?.key && item.arrangement ? (transposeKey(song.key, item.arrangement.transposeSteps) ?? song.key) : (song?.key ?? null);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-3 bg-card py-2 first:pt-0 last:pb-0 ${isDragging ? "relative z-10 opacity-80 shadow-md" : ""}`}
      data-testid="set-song-row"
    >
      {canEdit ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("sets.dragToReorder", { title })}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}
      <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">{index + 1}.</span>
      {/* Wide enough to read; the controls wrap below it on a narrow screen. */}
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        {song ? (
          <Link
            to="/sets/$setlistId/songs/$itemId"
            params={{ setlistId, itemId: item.id }}
            className="font-medium hover:underline"
          >
            {song.title}
            {song.versionName ? <span className="font-normal text-muted-foreground"> — {song.versionName}</span> : null}
          </Link>
        ) : (
          <span className="text-sm italic text-muted-foreground">{title}</span>
        )}
        {item.arrangement && !canEdit ? (
          <span className="text-xs text-muted-foreground">{t("sets.playedAs", { name: item.arrangement.name })}</span>
        ) : null}
        <OwnershipLine item={item} ownership={ownership} />
      </div>

      {song && canEdit && item.versions.length > 1 ? (
        <NativeSelect
          aria-label={t("sets.version")}
          value={song.id}
          onChange={(event) => onChange({ songVersionId: event.target.value })}
          compact
          className="max-w-56 text-sm"
        >
          {item.versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.versionName ? `${version.title} — ${version.versionName}` : version.title} · {scopeLabel(version, t)}
            </option>
          ))}
        </NativeSelect>
      ) : null}

      {song && canEdit && item.arrangements.length > 0 ? (
        <NativeSelect
          aria-label={t("sets.arrangement")}
          value={item.arrangement?.id ?? ""}
          onChange={(event) => onChange({ arrangementId: event.target.value || null })}
          compact
          className="max-w-56 text-sm"
        >
          <option value="">{t("sets.asWritten")}</option>
          {item.arrangements.map((arrangement) => (
            <option key={arrangement.id} value={arrangement.id}>
              {arrangement.isTeamDefault ? t("sets.usualArrangement", { name: arrangement.name }) : arrangement.name}
            </option>
          ))}
        </NativeSelect>
      ) : null}

      {song && canEdit ? (
        <NativeSelect
          aria-label={t("sets.key")}
          value={item.transposeSteps}
          onChange={(event) => onChange({ transposeSteps: Number(event.target.value) })}
          compact
          className="text-sm"
        >
          {TRANSPOSE_STEP_OPTIONS.map((steps) => (
            <option key={steps} value={steps}>
              {transposeLabel(baseKey, steps, t)}
            </option>
          ))}
        </NativeSelect>
      ) : song ? (
        <span className="text-sm text-muted-foreground">{transposeLabel(baseKey, item.transposeSteps, t)}</span>
      ) : null}

      {canEdit ? (
        <Button variant="ghost" size="icon" className="size-8" aria-label={t("sets.removeSong", { title })} onClick={onRemove}>
          <X />
        </Button>
      ) : null}
    </li>
  );
}

/** "Shared by …" and, for a team set, asking for / handing over / deciding on the song. */
function OwnershipLine({ item, ownership }: { item: SetlistItem; ownership: OwnershipActions }) {
  const { t } = useTranslation();
  if (!item.sharedBy && !item.ownershipRequest) return null;
  const sharedByMe = item.sharedBy?.id === ownership.currentUserId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.sharedBy ? (
        <Badge variant="muted">{sharedByMe ? t("sets.sharedByYou") : t("sets.sharedBy", { name: item.sharedBy.displayName })}</Badge>
      ) : null}
      {item.ownershipRequest?.canDecide ? (
        <>
          <span className="text-xs text-muted-foreground">{t("sets.teamAskedForYourSong")}</span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => ownership.onDecide(item.ownershipRequest!.id, true)}>
            {t("sets.accept")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => ownership.onDecide(item.ownershipRequest!.id, false)}>
            {t("sets.decline")}
          </Button>
        </>
      ) : item.ownershipRequest ? (
        <Badge variant="warning">{t("sets.requested")}</Badge>
      ) : item.canRequestOwnership ? (
        <Button size="sm" variant="outline" className="h-7" onClick={() => ownership.onRequest(item.id)}>
          {sharedByMe ? t("sets.giveToTeam") : t("sets.askForSong")}
        </Button>
      ) : null}
    </div>
  );
}
