import { SET_TRANSITIONS, type SetTransitionValue, type SetTransitionView } from "@songverse/core";
import { ArrowDown, ArrowRightLeft, ChevronsDown, Square, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";

/**
 * What happens after a song of a set (issue #199), as a symbol: a square
 * for the end, an arrow straight down for the next, a double one for a
 * segue (no pause), crossing arrows for a transition.
 */
export const TRANSITION_ICONS: Record<SetTransitionValue, LucideIcon> = { STOP: Square, NEXT: ArrowDown, SEGUE: ChevronsDown, TRANSITION: ArrowRightLeft };

export function TransitionSymbol({ kind, className }: { kind: SetTransitionValue | null | undefined; className?: string }) {
  const { t } = useTranslation();
  if (!kind) return null;
  const Icon = TRANSITION_ICONS[kind];
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-label={t(`sets.transitions.${kind}`)} role="img" data-testid="set-transition" data-kind={kind} />;
}

/**
 * The symbol as a menu, for who can change the set: no transition said, or
 * one of the four. (A transition's note is written on the set's page.)
 */
export function TransitionPicker({ kind, onChange, className }: { kind: SetTransitionValue | null | undefined; onChange: (kind: SetTransitionValue | null) => void; className?: string }) {
  const { t } = useTranslation();
  const Icon = kind ? TRANSITION_ICONS[kind] : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn("flex items-center justify-center text-muted-foreground hover:bg-sidebar-accent hover:text-foreground", className)}
            aria-label={kind ? t("sets.transitionIs", { kind: t(`sets.transitions.${kind}`) }) : t("sets.setTransition")}
            title={kind ? t(`sets.transitions.${kind}`) : t("sets.setTransition")}
            data-testid="set-transition-picker"
            data-kind={kind ?? ""}
          />
        }
      >
        {Icon ? <Icon className="size-3.5" /> : <span className="size-1 rounded-full bg-current opacity-40" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{t("sets.afterThisSong")}</DropdownMenuLabel>
        {SET_TRANSITIONS.map((one) => {
          const ItemIcon = TRANSITION_ICONS[one];
          return (
            <DropdownMenuItem key={one} onClick={() => onChange(one)} className={cn(kind === one && "font-semibold")} data-testid={`set-transition-${one}`}>
              <ItemIcon />
              {t(`sets.transitions.${one}`)}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem onClick={() => onChange(null)} data-testid="set-transition-none">
          <span className="size-4" />
          {t("sets.transitions.none")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** In Live, before the end of the song: what comes next - "Segue: no pause", "Key change: G → A · 72 → 96 BPM · Pad under the prayer". */
export function transitionText(view: SetTransitionView, t: (key: string, options?: Record<string, unknown>) => string): string {
  const parts: string[] = [t(`sets.transitionsLive.${view.kind}`)];
  if (view.kind === "TRANSITION" || view.kind === "SEGUE") {
    if (view.fromKey && view.toKey && view.fromKey !== view.toKey) parts.push(t("sets.keyChange", { from: view.fromKey, to: view.toKey }));
    if (view.fromTempo && view.toTempo && Math.round(view.fromTempo) !== Math.round(view.toTempo)) parts.push(t("sets.tempoChange", { from: Math.round(view.fromTempo), to: Math.round(view.toTempo) }));
  }
  if (view.note) parts.push(view.note);
  return parts.join(" · ");
}
