import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Recorder } from "#/lib/recorder";
import { cn } from "#/lib/utils";

/** About 3 s of the microphone, a peak every 50 ms. */
const HISTORY = 60;
const EVERY_MS = 50;
/** Its loudest over the last 1.5 s: under -24 dBFS is too quiet to sing into; at full scale, it clips. */
const JUDGED_OVER = 30;
const QUIET = 0.063;
const CLIPPING = 0.98;

export type InputLevelVerdict = "quiet" | "good" | "loud";

/** Whether a singer is loud enough, from their recent peaks (0-1). */
export function judgeLevel(peaks: number[]): InputLevelVerdict {
  const loudest = Math.max(0, ...peaks.slice(-JUDGED_OVER));
  return loudest >= CLIPPING ? "loud" : loudest < QUIET ? "quiet" : "good";
}

/**
 * What the microphone hears, as soon as it's open (issue #141): the last
 * few seconds scrolling by, and whether that's loud enough - before a take,
 * so there's no need to record one to find out.
 */
export function InputLevel({ recorder, className }: { recorder: Recorder | null; className?: string }) {
  const { t } = useTranslation();
  const [peaks, setPeaks] = useState<number[]>([]);
  const latest = useRef<number[]>([]);

  useEffect(() => {
    latest.current = [];
    setPeaks([]);
    if (!recorder) return;
    const timer = setInterval(() => {
      latest.current = [...latest.current.slice(1 - HISTORY), recorder.inputPeak()];
      setPeaks(latest.current);
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [recorder]);

  if (!recorder) return null;
  const verdict = judgeLevel(peaks);
  const colour = verdict === "good" ? "fill-primary" : verdict === "loud" ? "fill-destructive" : "fill-amber-500";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", className)} data-testid="input-level" data-level={peaks.length ? verdict : "none"}>
      <span className="shrink-0 text-muted-foreground">{t("recorder.micLevel")}</span>
      <svg viewBox={`0 0 ${HISTORY} 100`} preserveAspectRatio="none" className="h-6 min-w-0 flex-1 rounded-sm bg-muted/50" aria-hidden>
        <path
          d={peaks
            .map((peak, i) => {
              const height = Math.max(2, peak * 96);
              return `M${HISTORY - peaks.length + i} ${50 - height / 2}h0.75v${height}h-0.75z`;
            })
            .join("")}
          className={colour}
        />
      </svg>
      <span className={cn("w-full sm:w-56 sm:shrink-0", verdict === "good" ? "text-muted-foreground" : verdict === "loud" ? "text-destructive" : "text-amber-700 dark:text-amber-400")} role="status">
        {peaks.length ? t(verdict === "good" ? "recorder.levelGood" : verdict === "loud" ? "recorder.levelLoud" : "recorder.levelQuiet") : null}
      </span>
    </div>
  );
}
