import { SECTION_TYPES } from "@songverse/core";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, MoreHorizontal, Repeat, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { NativeSelect } from "#/components/ui/native-select";
import { cn } from "#/lib/utils";
import { deleteSection, duplicateSection, moveSection } from "./extensions";
import { useSongOrderActions } from "./song-order-context";

/** A section in the editor: its heading controls (type, label, shown or not, menu) above its lines. */
export function SectionView({ node, editor, getPos, updateAttributes }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const orderActions = useSongOrderActions();
  const type = node.attrs.type as (typeof SECTION_TYPES)[number];
  const label = (node.attrs.label as string | null) ?? "";
  const showLabel = node.attrs.showLabel !== false;
  const typeName = t(`chart.sections.${type}`);
  const at = () => getPos() ?? -1;
  const index = editor.state.doc.resolve(Math.max(0, at())).index(0);
  const count = editor.state.doc.childCount;

  return (
    <NodeViewWrapper as="section" className="sv-section group/section" data-section-type={type} data-section-id={node.attrs.id}>
      <div
        data-sv-section-header=""
        contentEditable={false}
        className="mb-1.5 flex flex-wrap items-center gap-1.5 pb-1 font-sans select-none"
      >
        <NativeSelect
          compact
          aria-label={t("structuredEditor.sectionType")}
          value={type}
          onChange={(event) => updateAttributes({ type: event.target.value })}
          className="h-7 font-semibold tracking-wide uppercase"
        >
          {SECTION_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(`chart.sections.${option}`)}
            </option>
          ))}
        </NativeSelect>
        <input
          aria-label={t("structuredEditor.sectionLabel")}
          value={label}
          placeholder={t("structuredEditor.sectionLabelPlaceholder", { type: typeName })}
          maxLength={100}
          onChange={(event) => updateAttributes({ label: event.target.value || null })}
          className={cn(
            "h-7 w-36 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-xs outline-none hover:border-input focus:border-ring",
            !showLabel && "text-muted-foreground line-through",
          )}
        />
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-pressed={!showLabel}
          aria-label={showLabel ? t("structuredEditor.hideLabel") : t("structuredEditor.showLabel")}
          title={showLabel ? t("structuredEditor.hideLabel") : t("structuredEditor.showLabel")}
          onClick={() => updateAttributes({ showLabel: !showLabel })}
        >
          {showLabel ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("structuredEditor.sectionMenu", { section: label || typeName })} />}>
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={index === 0} onClick={() => moveSection(editor.view, at(), -1)}>
              <ArrowUp />
              {t("structuredEditor.moveUp")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onClick={() => moveSection(editor.view, at(), 1)}>
              <ArrowDown />
              {t("structuredEditor.moveDown")}
            </DropdownMenuItem>
            {/* Sung again, linked: the same section, another pass in the song's order - changed there for that pass only (issue #205). */}
            {orderActions ? (
              <DropdownMenuItem onClick={() => orderActions.singAgain(node.attrs.id as string)} data-testid="section-sing-again">
                <Repeat />
                {t("structuredEditor.singAgain")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => duplicateSection(editor.view, at())}>
              <Copy />
              {t("structuredEditor.duplicateSection")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteSection(editor.view, at())}>
              <Trash2 />
              {t("structuredEditor.deleteSection")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <NodeViewContent className="sv-lines" />
    </NodeViewWrapper>
  );
}
