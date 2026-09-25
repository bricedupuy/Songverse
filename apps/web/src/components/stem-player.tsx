import { STEM_PARTS, type Attachment, type StemPart } from "@songverse/core";
import { Headphones, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { cn } from "#/lib/utils";

/** A song's stems: its audio files marked as a part, in the player's order. */
export function stemsOf(attachments: Attachment[]): (Attachment & { stemPart: StemPart })[] {
  return attachments
    .filter((file): file is Attachment & { stemPart: StemPart } => file.type === "AUDIO" && file.stemPart !== null)
    .sort((a, b) => STEM_PARTS.indexOf(a.stemPart) - STEM_PARTS.indexOf(b.stemPart) || a.filename.localeCompare(b.filename));
}

interface Track {
  attachment: Attachment & { stemPart: StemPart };
  label: string;
  buffer: AudioBuffer | null;
  gain: GainNode | null;
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Plays a song's stems together (issue #64), each part with its own mute and
 * solo. Web Audio keeps them on one clock: every part starts at the same
 * instant of the same AudioContext, so they stay sample-locked, where
 * separate <audio> elements drift apart. The files are fetched and decoded
 * on the first Play, not before.
 */
export function StemPlayer({ stems, load }: { stems: (Attachment & { stemPart: StemPart })[]; load: (file: Attachment) => Promise<Blob> }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loaded, setLoaded] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [soloed, setSoloed] = useState<Set<string>>(new Set());
  const context = useRef<AudioContext | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  // The context's time at which the song's 0:00 is (or would be) playing.
  const startedAt = useRef(0);
  const offset = useRef(0);
  const frame = useRef(0);

  // Two files of the same part: "Guitar 1", "Guitar 2".
  const labels = stems.map((stem, index) => {
    const same = stems.filter((other) => other.stemPart === stem.stemPart);
    const name = t(`stems.parts.${stem.stemPart}`);
    return same.length > 1 ? `${name} ${stems.slice(0, index + 1).filter((other) => other.stemPart === stem.stemPart).length}` : name;
  });

  const audible = (id: string) => (soloed.size > 0 ? soloed.has(id) : !muted.has(id));

  useEffect(() => {
    const ctx = context.current;
    if (!ctx) return;
    for (const track of tracks) track.gain?.gain.setTargetAtTime(audible(track.attachment.id) ? 1 : 0, ctx.currentTime, 0.01);
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      stopSources();
      void context.current?.close();
    },
    [],
  );

  function stopSources() {
    for (const source of sources.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Never started.
      }
    }
    sources.current = [];
  }

  async function ensureLoaded(): Promise<{ ctx: AudioContext; tracks: Track[]; duration: number } | null> {
    if (context.current && status === "ready") return { ctx: context.current, tracks, duration };
    setStatus("loading");
    setLoaded(0);
    void context.current?.close();
    const ctx = new AudioContext();
    context.current = ctx;
    try {
      const next = await Promise.all(
        stems.map(async (attachment, index): Promise<Track> => {
          let buffer: AudioBuffer | null = null;
          try {
            buffer = await ctx.decodeAudioData(await (await load(attachment)).arrayBuffer());
          } catch {
            // Shown on its row; the other parts still play.
          }
          setLoaded((count) => count + 1);
          const gain = buffer ? ctx.createGain() : null;
          gain?.connect(ctx.destination);
          return { attachment, label: labels[index] ?? attachment.filename, buffer, gain };
        }),
      );
      const longest = Math.max(0, ...next.map((track) => track.buffer?.duration ?? 0));
      if (!next.some((track) => track.buffer)) throw new Error("nothing decoded");
      setTracks(next);
      setDuration(longest);
      setStatus("ready");
      return { ctx, tracks: next, duration: longest };
    } catch {
      setStatus("error");
      return null;
    }
  }

  function tick(ctx: AudioContext, length: number) {
    const now = ctx.currentTime - startedAt.current;
    if (now >= length) {
      stopSources();
      offset.current = 0;
      setPosition(0);
      setPlaying(false);
      return;
    }
    setPosition(Math.max(0, now));
    frame.current = requestAnimationFrame(() => tick(ctx, length));
  }

  function startAt(ctx: AudioContext, list: Track[], from: number, length: number) {
    stopSources();
    cancelAnimationFrame(frame.current);
    // A moment ahead, so every part is scheduled before the first one starts.
    const when = ctx.currentTime + 0.05;
    for (const track of list) {
      if (!track.buffer || !track.gain || from >= track.buffer.duration) continue;
      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.connect(track.gain);
      source.start(when, from);
      sources.current.push(source);
    }
    startedAt.current = when - from;
    frame.current = requestAnimationFrame(() => tick(ctx, length));
  }

  async function play() {
    const ready = await ensureLoaded();
    if (!ready) return;
    await ready.ctx.resume();
    // Gains before the first sound, so a part muted while loading stays silent.
    for (const track of ready.tracks) track.gain?.gain.setValueAtTime(audible(track.attachment.id) ? 1 : 0, ready.ctx.currentTime);
    startAt(ready.ctx, ready.tracks, offset.current, ready.duration);
    setPlaying(true);
  }

  function pause() {
    const ctx = context.current;
    if (!ctx) return;
    offset.current = Math.min(duration, Math.max(0, ctx.currentTime - startedAt.current));
    cancelAnimationFrame(frame.current);
    stopSources();
    setPosition(offset.current);
    setPlaying(false);
  }

  function seek(to: number) {
    offset.current = to;
    setPosition(to);
    const ctx = context.current;
    if (playing && ctx) startAt(ctx, tracks, to, duration);
  }

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };

  return (
    <Card data-testid="stem-player" data-state={playing ? "playing" : status}>
      <CardHeader>
        <CardTitle className="text-sm">{t("stems.title")}</CardTitle>
        <CardDescription>{t("stems.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon"
            onClick={() => void (playing ? pause() : play())}
            disabled={status === "loading"}
            aria-label={playing ? t("stems.pause") : t("stems.play")}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="stem-time">
            {formatTime(position)} / {formatTime(duration)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(position, duration)}
            disabled={status !== "ready"}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label={t("stems.position")}
            className="min-w-0 flex-1 accent-primary"
          />
        </div>
        {status === "loading" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("stems.loading", { done: loaded, count: stems.length })}
          </p>
        ) : null}
        {status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {t("stems.loadFailed")}
          </p>
        ) : null}
        <ul className="flex flex-col divide-y">
          {stems.map((stem, index) => {
            const label = labels[index] ?? stem.filename;
            const on = audible(stem.id);
            const track = tracks.find((candidate) => candidate.attachment.id === stem.id);
            return (
              <li
                key={stem.id}
                className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0"
                data-testid="stem-track"
                data-part={stem.stemPart}
                data-audible={String(on)}
              >
                <span className={cn("min-w-0 flex-1", !on && "opacity-50")}>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{stem.filename}</span>
                </span>
                {status === "ready" && track && !track.buffer ? (
                  <span className="text-xs text-destructive">{t("stems.failed", { name: stem.filename })}</span>
                ) : null}
                <Button
                  type="button"
                  size="icon"
                  variant={muted.has(stem.id) ? "secondary" : "ghost"}
                  aria-pressed={muted.has(stem.id)}
                  aria-label={t("stems.mute", { part: label })}
                  onClick={() => setMuted((set) => toggle(set, stem.id))}
                >
                  {muted.has(stem.id) ? <VolumeX /> : <Volume2 />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={soloed.has(stem.id) ? "secondary" : "ghost"}
                  aria-pressed={soloed.has(stem.id)}
                  aria-label={t("stems.solo", { part: label })}
                  onClick={() => setSoloed((set) => toggle(set, stem.id))}
                >
                  <Headphones />
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
