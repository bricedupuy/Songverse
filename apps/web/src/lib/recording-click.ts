import { metronomeForSong } from "@songverse/core";
import { useEffect, useSyncExternalStore } from "react";
import { getMetronomeState, playMetronomeOn, stopMetronome, useMetronome } from "#/lib/metronome-engine";
import { useStems } from "#/lib/stem-engine";

/**
 * The metronome with the recording (issue #100): while it's on, the
 * metronome plays the stems' beat - their recording's tempo (or the
 * song's), its first beat where the recording's falls - and follows their
 * play, pause and seek. The count-in comes before that first beat. When
 * leading Sync play, that metronome is shared like any other.
 */

let on = false;
const listeners = new Set<() => void>();

export function setRecordingClick(next: boolean) {
  on = next;
  for (const listener of listeners) listener();
  if (!next && getMetronomeState().playing && !getMetronomeState().following) stopMetronome();
}

export function useRecordingClick(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => on,
    () => false,
  );
}

/** In the app, once: keeps the metronome on the stems' beat while it's on. */
export function useRecordingClickBridge() {
  const enabled = useRecordingClick();
  const stems = useStems();
  const metronome = useMetronome();
  const beat = stems.beat;
  const anchorKey = JSON.stringify([enabled, stems.playing, stems.anchor, beat, stems.following, metronome.following]);
  useEffect(() => {
    if (!enabled || metronome.following || stems.following) return;
    if (!stems.playing || !stems.anchor || !beat) {
      if (getMetronomeState().playing) stopMetronome();
      return;
    }
    const settings = metronomeForSong(getMetronomeState().settings, { tempo: beat.tempo, timeSignature: beat.timeSignature });
    playMetronomeOn({
      settings,
      playing: true,
      // The song's bar 1 on the recording's first beat; the count-in before it.
      anchorEpoch: stems.anchor.epoch + (beat.firstBeat - stems.anchor.position) * 1000,
      anchorPosition: settings.countIn * settings.numerator,
    });
  }, [anchorKey]);
}
