import { metronomeForSong } from "@songverse/core";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { getMetronomeState, playMetronomeOn, stopMetronome, useMetronome } from "#/lib/metronome-engine";
import { isAudible, useStems } from "#/lib/stem-engine";

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
  const asked = useRecordingClick();
  const stems = useStems();
  // Slowed or sped up (issue #139), the click stem is silent: the metronome plays its beat instead, while it's heard.
  const standsIn = stems.speed !== 1 && stems.tracks.some((track) => track.part === "CLICK" && isAudible(stems, track.id));
  const enabled = asked || standsIn;
  const was = useRef(false);
  const metronome = useMetronome();
  const beat = stems.beat;
  const speed = stems.speed;
  const anchorKey = JSON.stringify([enabled, asked, stems.playing, stems.anchor, beat, speed, stems.following, metronome.following]);
  useEffect(() => {
    const before = was.current;
    was.current = enabled;
    if (!enabled) {
      // Standing in for the click stem no more.
      if (before && !asked && getMetronomeState().playing && !getMetronomeState().following) stopMetronome();
      return;
    }
    if (metronome.following || stems.following) return;
    if (!stems.playing || !stems.anchor || !beat) {
      if (getMetronomeState().playing) stopMetronome();
      return;
    }
    // Slower or faster (issue #139): the beat at the speed the stems play.
    const settings = metronomeForSong(getMetronomeState().settings, { tempo: beat.tempo * speed, timeSignature: beat.timeSignature });
    playMetronomeOn({
      settings,
      playing: true,
      // The song's bar 1 on the recording's first beat; the count-in before it.
      anchorEpoch: stems.anchor.epoch + ((beat.firstBeat - stems.anchor.position) / speed) * 1000,
      anchorPosition: settings.countIn * settings.numerator,
    });
  }, [anchorKey]);
}
