import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { metronomeClockReport } from "#/lib/metronome-engine";
import type { OutputClockReport } from "#/lib/output-clock";
import { stemsClockReport } from "#/lib/stem-engine";
import { syncReport } from "#/lib/sync-client";

const FLAG = "songverse.debug.sync";

/**
 * Sync details (issue #101, a first cut for #102): what this device knows
 * of its clocks, to tell why it isn't in time. On with `?debug=sync` in the
 * address (kept for the tab), off with its × or `?debug=off`. Not
 * translated: it's for debugging.
 */
export function SyncDetails() {
  const [on, setOn] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    try {
      const asked = new URLSearchParams(window.location.search).get("debug");
      if (asked === "sync") sessionStorage.setItem(FLAG, "1");
      if (asked === "off") sessionStorage.removeItem(FLAG);
      setOn(sessionStorage.getItem(FLAG) === "1");
    } catch {
      // Storage blocked: off.
    }
  }, []);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [on]);
  if (!on) return null;

  const sync = syncReport();
  const metronome = metronomeClockReport();
  const stems = stemsClockReport();
  const ms = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? "-" : `${value.toFixed(digits)} ms`);
  const clockLines = (name: string, clock: OutputClockReport | null) =>
    clock
      ? [
          `${name}: ${clock.state}, output timestamp ${clock.trusted ? "used" : "not used"}${clock.rejected ? ` (${clock.rejected} readings refused)` : ""}`,
          `  timestamp − audio clock: ${clock.stampLag !== null && clock.plainLag !== null ? ms(clock.stampLag - clock.plainLag) : "-"}`,
          `  output delay ${ms(clock.outputLatency * 1000)}, base ${ms(clock.baseLatency * 1000)}`,
        ]
      : [`${name}: no audio yet`];
  const lines = [
    `sync: ${sync.status}${sync.leading ? ", leading" : ""}, ${sync.members} in sync`,
    `  server − device: ${ms(sync.offset)}, round trip ${ms(sync.rtt)} (last ${ms(sync.lastRtt)}, ${sync.pings} pings)`,
    ...clockLines("metronome", metronome.clock),
    `  ${metronome.playing ? "playing" : "stopped"}${metronome.following ? ` following ${metronome.following}` : ""}, re-placed: ${metronome.corrections.map((c) => `${c.ms}`).join(", ") || "never"}`,
    ...clockLines("stems", stems.clock),
    `  ${stems.playing ? "playing" : "stopped"}${stems.following ? ` following ${stems.following}` : ""}, re-placed: ${stems.corrections.map((c) => `${c.ms}`).join(", ") || "never"}`,
  ];

  return (
    <div
      className="fixed top-16 left-2 z-[60] max-w-[calc(100vw-1rem)] rounded-md border bg-background/95 p-2 font-mono text-[11px] leading-snug shadow-lg"
      data-testid="sync-details"
    >
      <button
        type="button"
        className="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-accent"
        aria-label="Close sync details"
        onClick={() => {
          try {
            sessionStorage.removeItem(FLAG);
          } catch {
            // Nothing kept.
          }
          setOn(false);
        }}
      >
        <X className="size-3" />
      </button>
      <pre className="pr-5 whitespace-pre-wrap">{lines.join("\n")}</pre>
    </div>
  );
}
