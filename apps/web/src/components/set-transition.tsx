import { degreeChords, SET_TRANSITIONS, transitionDegrees, transitionProgressions, type ChordDiagramsValue, type ChordNotationValue, type DiagramPlayer, type SetTransitionValue, type SetTransitionView } from "@songverse/core";
import { ArrowDown, ArrowRight, ArrowRightLeft, ChevronsDown, Music, Square, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChordRow } from "#/components/chord-diagrams";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { NativeSelect } from "#/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
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

/**
 * The chords played into the next song (issues #10, #217), for who edits the
 * set: from this song's last chord to the next one's first, suggestions from
 * music theory for the two keys as they're played - its dominant, a ii-V, a
 * chord both keys share... - with as many chords as asked for, or typed
 * (letters, or Nashville numbers). Every chord is tapped to hear it. Kept as
 * degrees of the next song's key, so they follow it when it's moved.
 */
export function TransitionChordsPicker({
  fromKey,
  toKey,
  lastChord,
  firstChord,
  degrees,
  onChange,
  diagrams,
  notation = "LETTERS",
  player,
  className,
}: {
  fromKey: string | null;
  toKey: string | null;
  /** This song's last chord and the next one's first, as played (issue #217). */
  lastChord?: string | null;
  firstChord?: string | null;
  degrees: string[];
  onChange: (degrees: string[]) => void;
  /** The player's instrument and names (Live), for what's heard; a guitar otherwise. */
  diagrams?: ChordDiagramsValue;
  notation?: ChordNotationValue;
  player?: DiagramPlayer;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [invalid, setInvalid] = useState(false);
  const suggestions = useMemo(() => transitionProgressions(fromKey, toKey, { ...(count === null ? {} : { chords: count }), firstChord }), [fromKey, toKey, count, firstChord]);
  const current = toKey ? degreeChords(degrees, toKey) : degrees;
  const chosen = degrees.join(" ");
  const row = (chords: string[], testId: string) => <ChordRow chords={chords} names diagrams={diagrams} notation={notation} player={player} musicalKey={toKey} testId={testId} />;

  function pick(next: string[]) {
    onChange(next);
    setOpen(false);
  }
  function keepTyped() {
    // Without the next song's key, only numbers can be kept.
    const read = transitionDegrees(typed, toKey ?? "C");
    const ok = read && read.length > 0 && read.length <= 8 && (toKey || typed.trim().split(/[\s,]+/).every((part) => /^[#b]?[1-7]/.test(part)));
    if (!ok) return setInvalid(true);
    setInvalid(false);
    setTyped("");
    pick(read);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 font-normal", className)}
            aria-label={t("sets.transitionChordsLabel")}
            data-testid="set-song-transition-chords"
            data-degrees={chosen}
          />
        }
      >
        <Music className="size-3.5" />
        {current.length > 0 ? <span className="font-semibold">{current.join(" ")}</span> : t("sets.transitionChords")}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-[70vh] w-80 flex-col gap-3 overflow-y-auto sm:w-96" data-testid="transition-chords-picker">
        <p className="text-sm font-medium">{toKey ? t("sets.transitionChordsInto", { key: toKey }) : t("sets.transitionChordsLabel")}</p>
        {/* Where it goes from and to: the end of this song, what's chosen, the start of the next - each heard with a tap. */}
        {lastChord || firstChord ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="transition-chords-frame">
            {lastChord ? (
              <span className="flex items-center gap-1">
                {t("sets.transitionFrom")}
                {row([lastChord], "transition-last-chord")}
              </span>
            ) : null}
            <ArrowRight className="size-3.5" aria-hidden />
            {current.length > 0 ? row(current, "transition-chosen-chords") : <span>…</span>}
            <ArrowRight className="size-3.5" aria-hidden />
            {firstChord ? (
              <span className="flex items-center gap-1">
                {t("sets.transitionTo")}
                {row([firstChord], "transition-first-chord")}
              </span>
            ) : null}
          </div>
        ) : null}
        {!fromKey || !toKey ? (
          <p className="text-xs text-muted-foreground">{t("sets.transitionChordsNeedKeys")}</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("sets.transitionChordCount")}
              <NativeSelect compact className="text-sm" value={count ?? ""} onChange={(event) => setCount(event.target.value ? Number(event.target.value) : null)} data-testid="transition-chord-count">
                <option value="">{t("sets.transitionChordCountAny")}</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <ul className="-mx-1 flex flex-col">
              {suggestions.map((one) => (
                <li
                  key={one.kind}
                  className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", one.degrees.join(" ") === chosen && "bg-muted")}
                  data-testid="transition-suggestion"
                  data-kind={one.kind}
                  data-degrees={one.degrees.join(" ")}
                >
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="text-xs text-muted-foreground">
                      {t(`sets.transitionKinds.${one.kind}`)} · <span className="font-mono">{one.degrees.join(" ")}</span>
                    </span>
                    {row(one.chords, "transition-suggestion-chords")}
                  </span>
                  <Button type="button" size="sm" variant="secondary" className="h-7 shrink-0" onClick={() => pick(one.degrees)} data-testid="transition-suggestion-use">
                    {t("sets.transitionChordsUse")}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("sets.transitionChordsTapToHear")}</p>
          </>
        )}
        <form
          className="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            keepTyped();
          }}
        >
          <span className="flex gap-1">
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={t("sets.transitionChordsOwn")} aria-label={t("sets.transitionChordsOwn")} className="h-8 text-sm" data-testid="transition-chords-typed" />
            <Button type="submit" size="sm" className="h-8" disabled={!typed.trim()} data-testid="transition-chords-typed-use">
              {t("sets.transitionChordsUse")}
            </Button>
          </span>
          {invalid ? <span className="text-xs text-destructive">{t("sets.transitionChordsInvalid")}</span> : null}
        </form>
        {degrees.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => pick([])} data-testid="transition-chords-clear">
            {t("sets.transitionChordsNone")}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
