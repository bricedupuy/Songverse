import type { MetronomeSettings } from "../metronome/index.js";

/**
 * Sync play (issue #13): the messages between a device and the API's
 * WebSocket at `/sync`, and the clock maths. One device leads a set's
 * session; the others follow it. Only the timeline crosses the network -
 * "these settings, beat `anchorPosition` at server time `anchorAt`" - and
 * each device plays it on its own clock, so a follower that drops off
 * keeps time. Kept small and JSON, for a headless device (#62) too.
 */

export const SYNC_PATH = "/sync";

/** The metronome as the leader plays it; followers keep their own sound and volume. */
export interface SyncMetronome {
  settings: Omit<MetronomeSettings, "sound" | "volume">;
  playing: boolean;
  /** Server time (ms since the epoch) of beat `anchorPosition`. */
  anchorAt: number;
  /** In beats from the start, count-in included (see clicksBetween). */
  anchorPosition: number;
}

export interface SyncSession {
  /** Goes up with each change. */
  rev: number;
  leader: { id: string; name: string; online: boolean };
  metronome: SyncMetronome | null;
  /** The set item the leader has open, for followers to follow; null when none. */
  itemId: string | null;
}

export interface SyncMember {
  id: string;
  name: string;
  leading: boolean;
}

export type SyncClientMessage =
  | { type: "hello"; token: string }
  | { type: "ping"; id: number; sent: number }
  | { type: "join"; setId: string }
  | { type: "leave" }
  /** Starts a session, or takes over the lead of the one going on. */
  | { type: "lead" }
  | { type: "update"; metronome?: SyncMetronome | null; itemId?: string | null }
  | { type: "end" };

export type SyncServerMessage =
  | { type: "ready"; userId: string }
  | { type: "pong"; id: number; sent: number; at: number }
  | {
      type: "session";
      setId: string;
      session: SyncSession | null;
      members: SyncMember[];
      /** This device leads it. */
      leading: boolean;
      /** This user may lead (they can edit the set). */
      canLead: boolean;
    }
  | { type: "error"; code: "unauthorized" | "not-found" | "forbidden" | "bad-request"; message: string };

/** One ping's round trip: sent and received on the device's clock, `at` on the server's (all ms). */
export interface ClockSample {
  sent: number;
  at: number;
  received: number;
}

/**
 * The server's clock less the device's, from the round trip that took the
 * least time (the one least delayed on the way, so the most exact): the
 * server read its clock halfway through it.
 */
export function clockOffset(samples: ClockSample[]): { offset: number; rtt: number } | null {
  let best: ClockSample | null = null;
  for (const sample of samples) {
    if (sample.received < sample.sent) continue;
    if (!best || sample.received - sample.sent < best.received - best.sent) best = sample;
  }
  if (!best) return null;
  return { offset: best.at - (best.sent + best.received) / 2, rtt: best.received - best.sent };
}

/** The settings a leader shares: all but their own sound and volume. */
export function sharedMetronomeSettings(settings: MetronomeSettings): SyncMetronome["settings"] {
  return {
    tempo: settings.tempo,
    numerator: settings.numerator,
    denominator: settings.denominator,
    beats: settings.beats,
    subdivision: settings.subdivision,
    countIn: settings.countIn,
    countInOnly: settings.countInOnly,
  };
}
