import type { Editor } from "@tiptap/react";
import { ArrowDown, ArrowUp, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "#/lib/utils";
import { moveBlock } from "./extensions";

/**
 * The tools at the right of a block's heading - a section's or a linked
 * copy's, lined up on the same edge - shown when the heading has room
 * (a container query on it, `@container/block`): moving the block up or
 * down, then a linked duplicate. Each is in the block's menu too. The
 * block's own controls come first (`leading`), its menu last (`children`).
 */
export function BlockTools({ editor, at, onDuplicateLinked, leading, children }: { editor: Editor; at: () => number; onDuplicateLinked?: () => void; leading?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const index = editor.state.doc.resolve(Math.max(0, at())).index(0);
  const count = editor.state.doc.childCount;
  return (
    <div className="ml-auto flex items-center gap-0.5" data-block-tools="">
      {leading}
      {onDuplicateLinked ? (
        <ToolButton className="hidden @xl/block:flex" label={t("structuredEditor.duplicateLinked")} onClick={onDuplicateLinked} testId="block-duplicate-linked">
          <Link2 />
        </ToolButton>
      ) : null}
      <ToolButton className="hidden @md/block:flex" label={t("structuredEditor.moveUp")} disabled={index === 0} onClick={() => moveBlock(editor.view, at(), -1)} testId="block-move-up">
        <ArrowUp />
      </ToolButton>
      <ToolButton className="hidden @md/block:flex" label={t("structuredEditor.moveDown")} disabled={index === count - 1} onClick={() => moveBlock(editor.view, at(), 1)} testId="block-move-down">
        <ArrowDown />
      </ToolButton>
      {children}
    </div>
  );
}

function ToolButton({ label, onClick, disabled, className, testId, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn("items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5", className)}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
