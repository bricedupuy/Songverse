import {
  encodeWav,
  formatDuration,
  newMultitrackId,
  RECORDING_TIME_SIGNATURES,
  recordingPlan,
  STEM_PARTS,
  TIME_SIGNATURE_PATTERN,
  type Attachment,
  type Multitrack,
  type RecordingDetails,
  type StemPart,
} from "@songverse/core";
import { Circle, Headphones, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { NativeSelect } from "#/components/ui/native-select";
import { apiClient } from "#/lib/api-client";
import { getMetronomeState, stopMetronome } from "#/lib/metronome-engine";
import { Recorder, type Beat, type Take } from "#/lib/recorder";
import { pauseStems } from "#/lib/stem-engine";

/** A take can be this long at most: its WAV file stays under the upload limit for audio (50 MB). */
const MAX_BYTES = 50 * 1024 * 1024 - 1024;

type Phase = "opening" | "ready" | "recording" | "recorded" | "saving";

/**
 * Records a part (issue #123): into one of the song's multitracks, hearing
 * its other parts and the click, or into a new one with the metronome
 * only - the first layer of a song, or another version of it. The take is
 * lined up with the rest (the device's round trip taken off, a nudge to
 * fine-tune it), then kept as that part of the multitrack, private until
 * shared.
 */
export function RecorderDialog({
  songVersionId,
  songTitle,
  multitrack,
  multitrackName,
  songTempo,
  songTimeSignature,
  songKey,
  onClose,
  onSaved,
}: {
  songVersionId: string;
  songTitle: string;
  /** Null: a new multitrack. */
  multitrack: Multitrack<Attachment> | null;
  multitrackName: string | null;
  songTempo: number | null;
  /** "4/4", or "". */
  songTimeSignature: string;
  songKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const first = multitrack?.files[0];
  const recorder = useRef<Recorder | null>(null);
  const [phase, setPhase] = useState<Phase>("opening");
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState<StemPart>(multitrack ? "OTHER" : "VOCALS");
  // A new multitrack's name, tempo and time signature; an existing one's are its own.
  const [name, setName] = useState("");
  const [tempo, setTempo] = useState(String(first?.recordingTempo ?? songTempo ?? 100));
  const [signature, setSignature] = useState(first?.recordingTimeSignature ?? (songTimeSignature || "4/4"));
  const [click, setClick] = useState(true);
  const [heard, setHeard] = useState<Set<string>>(new Set());
  const [roundTrip, setRoundTrip] = useState<{ seconds: number; measured: boolean } | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationFailed, setCalibrationFailed] = useState(false);
  const [zeroAt, setZeroAt] = useState(0);
  const [position, setPosition] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [aligned, setAligned] = useState<Float32Array | null>(null);
  const [nudge, setNudge] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const alignedRef = useRef<Float32Array | null>(null);
  alignedRef.current = aligned;

  const tempoValue = Number(tempo);
  const signatureMatch = TIME_SIGNATURE_PATTERN.exec(signature);
  // An existing multitrack without a tempo (nor the song): recorded without a click.
  const hasTempo = multitrack ? first?.recordingTempo != null || songTempo != null : true;
  const beatsPerBar = signatureMatch ? Number(signatureMatch[1]) : 4;
  const plan = hasTempo && tempoValue >= 20 && tempoValue <= 400 ? recordingPlan({ tempo: tempoValue, beatsPerBar, firstBeat: multitrack ? (first?.recordingFirstBeat ?? 0) : null }) : null;
  const beat: Beat | null = plan ? { tempo: tempoValue, beatsPerBar, firstBeat: plan.firstBeat } : null;
  const valid = !multitrack ? tempoValue >= 20 && tempoValue <= 400 && !!signatureMatch : true;

  useEffect(() => {
    let closed = false;
    // Nothing else plays over the take.
    pauseStems();
    if (getMetronomeState().playing && !getMetronomeState().following) stopMetronome();
    Recorder.open()
      .then(async (opened) => {
        if (closed) return opened.close();
        recorder.current = opened;
        setRoundTrip(opened.roundTrip());
        if (multitrack) {
          const files = await Promise.all(
            multitrack.files.map(async (file) => ({ id: file.id, blob: await apiClient.downloadAttachment(songVersionId, file.id).catch(() => null) })),
          );
          await opened.setBacking(files.filter((file): file is { id: string; blob: Blob } => file.blob !== null));
          if (closed) return;
          setHeard(new Set(opened.backingIds));
        }
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (closed) return;
        setError(err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError") ? t("recorder.noMicrophone") : t("recorder.cantOpen"));
      });
    return () => {
      closed = true;
      recorder.current?.close();
      recorder.current = null;
    };
  }, []);

  // The time while recording, and the limit.
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      const current = recorder.current;
      if (!current) return;
      const at = current.positionOf(zeroAt);
      setPosition(at);
      if (at * current.context.sampleRate * 2 > MAX_BYTES) void stop();
    }, 100);
    return () => clearInterval(timer);
  }, [phase, zeroAt]);

  function start() {
    const current = recorder.current;
    if (!current || !valid) return;
    setError(null);
    setTake(null);
    setAligned(null);
    setNudge(0);
    setPosition(-(plan?.lead ?? 0));
    setZeroAt(current.start({ beat, lead: plan?.lead ?? 0, click, heard }));
    setPhase("recording");
  }

  async function stop() {
    const current = recorder.current;
    if (!current) return;
    const done = await current.finish(zeroAt);
    const lined = current.aligned(done, current.roundTrip().seconds);
    setTake(done);
    setAligned(lined);
    setPhase("recorded");
  }

  function preview() {
    const current = recorder.current;
    if (!current || !aligned) return;
    if (previewing) {
      current.stopPlaying();
      return setPreviewing(false);
    }
    current.preview(aligned, { beat, click, heard, nudge: nudge / 1000 });
    setPreviewing(true);
    const length = aligned.length / current.context.sampleRate;
    const started = aligned;
    setTimeout(() => setPreviewing((now) => (now && started === alignedRef.current ? false : now)), (length + 0.5) * 1000);
  }

  async function calibrate() {
    const current = recorder.current;
    if (!current) return;
    setCalibrating(true);
    setCalibrationFailed(false);
    const measured = await current.calibrate();
    setCalibrating(false);
    if (measured === null) setCalibrationFailed(true);
    setRoundTrip(current.roundTrip());
  }

  async function keep() {
    const current = recorder.current;
    if (!current || !take) return;
    current.stopPlaying();
    setPreviewing(false);
    setPhase("saving");
    setError(null);
    try {
      const samples = current.aligned(take, current.roundTrip().seconds + nudge / 1000);
      const wav = encodeWav(samples, take.sampleRate);
      const partName = t(`stems.parts.${part}`);
      const file = new File([wav as Uint8Array<ArrayBuffer>], `${songTitle || t("recorder.recording")} - ${partName}.wav`, { type: "audio/wav" });
      // A new multitrack: what it was recorded in. An existing one: its own, shared by its parts.
      const details: RecordingDetails = multitrack
        ? {
            ...(multitrack.id ? { multitrackId: multitrack.id } : {}),
            ...(first?.multitrackName ? { multitrackName: first.multitrackName } : {}),
            ...(first?.recordingKey ? { recordingKey: first.recordingKey } : {}),
            ...(first?.recordingTempo != null ? { recordingTempo: first.recordingTempo } : {}),
            ...(first?.recordingTimeSignature ? { recordingTimeSignature: first.recordingTimeSignature } : {}),
            ...(first?.recordingFirstBeat != null ? { recordingFirstBeat: first.recordingFirstBeat } : {}),
          }
        : {
            multitrackId: newMultitrackId(),
            ...(name.trim() ? { multitrackName: name.trim() } : {}),
            recordingTempo: tempoValue,
            recordingTimeSignature: signature,
            recordingFirstBeat: plan?.firstBeat ?? 0,
          };
      await apiClient.uploadAttachment(songVersionId, "AUDIO", file, part, { visibility: "PRIVATE" }, details);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("recorded");
    }
  }

  const busy = phase === "opening" || phase === "recording" || phase === "saving" || calibrating;
  // The parts that could be decoded, to hear or not.
  const backing = multitrack?.files.filter((file) => recorder.current?.backingIds.includes(file.id)) ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && phase !== "saving" && onClose()}>
      <DialogContent data-testid="recorder" data-phase={phase}>
        <DialogHeader>
          <DialogTitle>{multitrack ? t("recorder.titleInto", { name: multitrackName }) : t("recorder.titleNew")}</DialogTitle>
          <DialogDescription>{multitrack ? t("recorder.descriptionInto") : t("recorder.descriptionNew")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="w-28 shrink-0">{t("recorder.part")}</span>
            <NativeSelect value={part} disabled={busy} onChange={(event) => setPart(event.target.value as StemPart)} data-testid="recorder-part">
              {STEM_PARTS.map((value) => (
                <option key={value} value={value}>
                  {t(`stems.parts.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          {multitrack ? (
            <p className="text-xs text-muted-foreground" data-testid="recorder-beat">
              {[first?.recordingKey ?? (songKey || null), beat ? `${beat.tempo} BPM` : t("recorder.noTempo"), signature].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2">
                <span className="w-28 shrink-0">{t("recorder.name")}</span>
                <Input value={name} maxLength={60} disabled={busy} placeholder={t("recorder.namePlaceholder")} onChange={(event) => setName(event.target.value)} data-testid="recorder-name" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0">{t("recorder.tempo")}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={400}
                  step="any"
                  value={tempo}
                  disabled={busy}
                  className="w-24"
                  aria-label={t("recorder.tempo")}
                  onChange={(event) => setTempo(event.target.value)}
                  data-testid="recorder-tempo"
                />
                <NativeSelect value={signature} disabled={busy} aria-label={t("recorder.timeSignature")} onChange={(event) => setSignature(event.target.value)} data-testid="recorder-signature">
                  {RECORDING_TIME_SIGNATURES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </>
          )}
          {backing.length > 0 ? (
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <legend className="mb-1 text-xs text-muted-foreground">{t("recorder.hear")}</legend>
              {backing.map((file) => (
                <label key={file.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={heard.has(file.id)}
                    disabled={busy}
                    onChange={(event) => {
                      const next = new Set(heard);
                      if (event.target.checked) next.add(file.id);
                      else next.delete(file.id);
                      setHeard(next);
                    }}
                  />
                  {file.stemPart ? t(`stems.parts.${file.stemPart}`) : file.filename}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={click} disabled={busy || !beat} onChange={(event) => setClick(event.target.checked)} data-testid="recorder-click" />
            {t("recorder.click")}
          </label>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Headphones className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("recorder.headphones")}
          </p>
          {roundTrip ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="recorder-latency">
              <span>
                {t(roundTrip.measured ? "recorder.delayMeasured" : "recorder.delayEstimated", { ms: Math.round(roundTrip.seconds * 1000) })}
              </span>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={busy} onClick={() => void calibrate()} data-testid="recorder-calibrate">
                {calibrating ? t("recorder.measuring") : t("recorder.measure")}
              </Button>
              {calibrationFailed ? <span className="w-full text-destructive">{t("recorder.measureFailed")}</span> : null}
            </div>
          ) : null}

          {phase === "recording" ? (
            <p className="flex items-center gap-2 font-medium" role="status" data-testid="recorder-status">
              <Circle className="size-3 animate-pulse fill-destructive text-destructive" aria-hidden />
              {position < (plan?.firstBeat ?? 0) ? t("recorder.countIn") : t("recorder.recordingAt", { time: formatDuration(position) })}
            </p>
          ) : null}
          {phase === "recorded" || phase === "saving" ? (
            <div className="flex flex-col gap-2 rounded-md border p-3" data-testid="recorder-take">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={preview} disabled={phase === "saving"} data-testid="recorder-preview">
                  {previewing ? <Square /> : <Play />}
                  {previewing ? t("recorder.stopPreview") : t("recorder.preview")}
                </Button>
                <span className="text-xs text-muted-foreground">{aligned && take ? formatDuration(aligned.length / take.sampleRate) : null}</span>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <span className="shrink-0">{t("recorder.nudge")}</span>
                <input
                  type="range"
                  min={-150}
                  max={150}
                  step={1}
                  value={nudge}
                  className="min-w-0 flex-1 accent-primary"
                  disabled={phase === "saving"}
                  onChange={(event) => {
                    setNudge(Number(event.target.value));
                    if (previewing) {
                      recorder.current?.stopPlaying();
                      setPreviewing(false);
                    }
                  }}
                  aria-label={t("recorder.nudge")}
                  data-testid="recorder-nudge"
                />
                <span className="w-16 shrink-0 text-right tabular-nums">{t("recorder.nudgeMs", { ms: nudge > 0 ? `+${nudge}` : nudge })}</span>
              </label>
              <p className="text-xs text-muted-foreground">{t("recorder.nudgeHint")}</p>
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {phase === "recording" ? (
            <Button type="button" variant="destructive" onClick={() => void stop()} data-testid="recorder-stop">
              <Square />
              {t("recorder.stop")}
            </Button>
          ) : phase === "recorded" || phase === "saving" ? (
            <>
              <Button type="button" variant="outline" onClick={start} disabled={phase === "saving"} data-testid="recorder-again">
                <RotateCcw />
                {t("recorder.again")}
              </Button>
              <Button type="button" onClick={() => void keep()} disabled={phase === "saving"} data-testid="recorder-keep">
                {phase === "saving" ? <Loader2 className="animate-spin" /> : null}
                {phase === "saving" ? t("recorder.saving") : t("recorder.keep")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={start} disabled={phase !== "ready" || !valid || calibrating} data-testid="recorder-start">
              {phase === "opening" && !error ? <Loader2 className="animate-spin" /> : <Circle className="fill-current" />}
              {t("recorder.record")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
