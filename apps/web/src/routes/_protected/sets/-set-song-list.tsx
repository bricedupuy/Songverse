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
import { TRANSPOSE_STEP_OPTIONS, type SetlistItem, type SetlistSongRef } from "@songverse/core";
import { Link } from "@tanstack/react-router";
import { GripVertical, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { transposeLabel } from "#/lib/setlists";

const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

interface SetSongListProps {
  items: SetlistItem[];
  canEdit: boolean;
  onReorder: (items: SetlistItem[]) => void;
  onChangeItem: (itemId: string, change: { songVersionId?: string; transposeSteps?: number }) => void;
  onRemoveItem: (itemId: string) => void;
}

export function SetSongList({ items, canEdit, onReorder, onChangeItem, onRemoveItem }: SetSongListProps) {
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
              item={item}
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
  item,
  index,
  canEdit,
  onChange,
  onRemove,
}: {
  item: SetlistItem;
  index: number;
  canEdit: boolean;
  onChange: (change: { songVersionId?: string; transposeSteps?: number }) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });
  const song = item.song;
  const title = song?.title ?? t("sets.hiddenSong");

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
      <div className="min-w-0 flex-1">
        {song ? (
          <Link to="/library/$songVersionId" params={{ songVersionId: song.id }} className="font-medium hover:underline">
            {song.title}
          </Link>
        ) : (
          <span className="text-sm italic text-muted-foreground">{title}</span>
        )}
      </div>

      {song && canEdit && item.versions.length > 1 ? (
        <select
          aria-label={t("sets.version")}
          value={song.id}
          onChange={(event) => onChange({ songVersionId: event.target.value })}
          className={`${SELECT_CLASS} max-w-56`}
        >
          {item.versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.title} · {scopeLabel(version, t)}
            </option>
          ))}
        </select>
      ) : null}

      {song && canEdit ? (
        <select
          aria-label={t("sets.key")}
          value={item.transposeSteps}
          onChange={(event) => onChange({ transposeSteps: Number(event.target.value) })}
          className={SELECT_CLASS}
        >
          {TRANSPOSE_STEP_OPTIONS.map((steps) => (
            <option key={steps} value={steps}>
              {transposeLabel(song.key, steps, t)}
            </option>
          ))}
        </select>
      ) : song ? (
        <span className="text-sm text-muted-foreground">{transposeLabel(song.key, item.transposeSteps, t)}</span>
      ) : null}

      {canEdit ? (
        <Button variant="ghost" size="icon" className="size-8" aria-label={t("sets.removeSong", { title })} onClick={onRemove}>
          <X />
        </Button>
      ) : null}
    </li>
  );
}
