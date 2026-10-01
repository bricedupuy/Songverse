import { formatScreenCode, lyricSlides, renderChart, type ScreenCurrent, type SyncPresenting } from "@songverse/core";
import { createFileRoute } from "@tanstack/react-router";
import { Music2, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { renderSVG } from "uqr";
import { LocaleProvider } from "#/components/locale-provider";
import { SongChart } from "#/components/song-chart";
import { loadLocale } from "#/lib/i18n";
import { useScreenDisplay } from "#/lib/screen-display";
import { getVisitorLocale } from "#/lib/server-auth";
import { setlistTitle } from "#/lib/setlists";

/**
 * A big screen (issue #186): open songverse.one/screen on whatever drives
 * it - a TV's browser, a laptop on HDMI, the Google TV app (#187). No
 * sign-in: it shows a code and a QR code until someone who leads a set
 * confirms it from their phone; then it shows what's presented from Live -
 * the lyrics two lines at a time, or the chart - and goes black on demand.
 */
export const Route = createFileRoute("/screen")({
  beforeLoad: async () => ({ locale: await loadLocale(await getVisitorLocale()) }),
  head: () => ({ meta: [{ title: "Songverse screen" }] }),
  component: ScreenPage,
});

function ScreenPage() {
  const { locale } = Route.useRouteContext();
  return (
    <LocaleProvider locale={locale}>
      <ScreenDisplay />
    </LocaleProvider>
  );
}

function ScreenDisplay() {
  const state = useScreenDisplay();
  useWakeLock();
  return (
    // Always black: what's on a projector is the words, not the page.
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black text-white select-none" data-testid="screen-display" data-state={state.kind}>
      {state.kind === "pairing" ? <Pairing code={state.code} /> : null}
      {state.kind === "showing" ? <Showing current={state.current} presenting={state.presenting} online={state.online} /> : null}
    </div>
  );
}

/** The code to type, and a QR code to scan that opens the phone's page with it. */
function Pairing({ code }: { code: string }) {
  const { t } = useTranslation();
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/screens?code=${code}`;
  const qr = useMemo(() => (link ? renderSVG(link, { pixelSize: 8, whiteColor: "#ffffff", blackColor: "#000000" }) : ""), [link]);
  return (
    <div className="flex size-full flex-col items-center justify-center gap-[4vh] p-[5vmin] text-center" data-testid="screen-pairing">
      <p className="flex items-center gap-3 text-[3vmin] font-semibold text-neutral-300">
        <Music2 className="size-[4vmin]" aria-hidden />
        Songverse
      </p>
      <div className="flex flex-wrap items-center justify-center gap-[6vmin]">
        {/* The QR code on white, for any phone's camera. */}
        <div className="size-[34vmin] rounded-[2vmin] bg-white p-[2vmin] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} data-testid="screen-qr" data-link={link} />
        <div className="flex flex-col items-center gap-[2vmin]">
          <p className="text-[3vmin] text-neutral-400">{t("screens.displayCodeLabel")}</p>
          <p className="font-mono text-[11vmin] leading-none font-bold tracking-[0.15em]" data-testid="screen-code">
            {formatScreenCode(code)}
          </p>
          <p className="max-w-[60vmin] text-[2.4vmin] text-neutral-400">{t("screens.displayCodeHint", { host: typeof window === "undefined" ? "" : window.location.host })}</p>
        </div>
      </div>
    </div>
  );
}

function Showing({ current, presenting, online }: { current: ScreenCurrent; presenting: SyncPresenting | null; online: boolean }) {
  const { t, i18n } = useTranslation();
  const set = current.set;
  const view = presenting && set ? set.songs.find((song) => song.item.id === presenting.itemId) : undefined;
  const chart = useMemo(
    () => (view?.song ? renderChart(view.song.document, view.arrangement?.document ?? null, { transposeSteps: view.item.transposeSteps, suggestedCapo: view.song.suggestedCapo }) : null),
    [view],
  );

  const body = !set ? (
    <Idle title={current.screen.name} subtitle={t("screens.displayNoSet")} />
  ) : !presenting || !view ? (
    <Idle title={setlistTitle(set.set, t, i18n.language)} subtitle={current.screen.name} />
  ) : presenting.black ? null : current.screen.mode === "CHART" ? (
    chart ? <ChartScreen chart={chart} title={view.song?.title ?? ""} slide={presenting.slide} /> : null
  ) : chart && view.song ? (
    <LyricsScreen chart={chart} slide={presenting.slide} title={view.song.title} credits={set.credits[view.song.id]} />
  ) : null;

  return (
    <div className="size-full" data-testid="screen-showing" data-mode={current.screen.mode} data-black={String(!!presenting?.black)} data-item={presenting?.itemId ?? ""} data-slide={presenting?.slide ?? ""}>
      {body}
      {/* Lost the connection: said quietly, in a corner; it comes back by itself. */}
      {!online ? <WifiOff className="absolute right-[2vmin] bottom-[2vmin] size-[3vmin] text-neutral-600" aria-label={t("screens.displayOffline")} /> : null}
    </div>
  );
}

function Idle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-[2vmin] text-center text-neutral-500" data-testid="screen-idle">
      <p className="text-[6vmin] font-semibold">{title}</p>
      <p className="text-[3vmin]">{subtitle}</p>
    </div>
  );
}

/**
 * The slide: its lines big, in the middle; the line before and the line after
 * faint, to see where it's going. A song's first slide has its title above,
 * its first and last its credits below.
 */
function LyricsScreen({
  chart,
  slide,
  title,
  credits,
}: {
  chart: ReturnType<typeof renderChart>;
  slide: number;
  title: string;
  credits: { writers: string[]; copyright: string | null; ccli: string | null } | undefined;
}) {
  const { t } = useTranslation();
  const slides = useMemo(() => lyricSlides(chart), [chart]);
  const index = Math.min(slide, slides.length - 1);
  const current = slides[index];
  if (!current) return null;
  const before = slides[index - 1]?.lines.at(-1);
  const after = slides[index + 1]?.lines[0];
  const edge = index === 0 || index === slides.length - 1;
  const creditLine = credits
    ? [credits.writers.join(", "), credits.copyright, credits.ccli ? t("screens.ccliSong", { number: credits.ccli }) : null].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="flex size-full flex-col items-center justify-center gap-[3vh] px-[6vw] text-center" data-testid="screen-lyrics">
      {index === 0 ? <p className="text-[3.2vmin] font-semibold tracking-wide text-neutral-400 uppercase">{title}</p> : null}
      <p className="min-h-[1.2em] text-[4vmin] leading-tight text-neutral-600" data-testid="screen-before">
        {before ?? ""}
      </p>
      <div key={`${current.passId}:${current.part}`} className="screen-slide flex flex-col gap-[1.5vh]" data-testid="screen-lines">
        {current.lines.map((line, i) => (
          <p key={i} className="text-[clamp(2rem,7vmin,9rem)] leading-[1.15] font-semibold text-balance">
            {line}
          </p>
        ))}
      </div>
      <p className="min-h-[1.2em] text-[4vmin] leading-tight text-neutral-600" data-testid="screen-after">
        {after ?? ""}
      </p>
      {edge && creditLine ? (
        <p className="absolute inset-x-[6vw] bottom-[3vh] text-[2vmin] text-neutral-500" data-testid="screen-credits">
          {creditLine}
        </p>
      ) : null}
    </div>
  );
}

/** The chart for the band, big, the pass being sung marked and kept in view. */
function ChartScreen({ chart, title, slide }: { chart: ReturnType<typeof renderChart>; title: string; slide: number }) {
  const box = useRef<HTMLDivElement>(null);
  const slides = useMemo(() => lyricSlides(chart), [chart]);
  const passId = slides[Math.min(slide, slides.length - 1)]?.passId ?? null;
  useEffect(() => {
    const pass = passId ? box.current?.querySelector<HTMLElement>(`[data-pass="${CSS.escape(passId)}"]`) : null;
    box.current?.querySelectorAll("[data-pass]").forEach((element) => element.removeAttribute("data-current"));
    if (!pass) return;
    pass.setAttribute("data-current", "true");
    pass.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [passId, chart]);
  return (
    <div ref={box} className="size-full overflow-hidden px-[4vw] py-[4vh] [&_[data-pass]]:rounded-lg [&_[data-pass]]:p-2 [&_[data-pass]]:opacity-60 [&_[data-pass][data-current]]:bg-white/10 [&_[data-pass][data-current]]:opacity-100" style={{ zoom: 1.8 }} data-testid="screen-chart">
      <p className="mb-4 text-xl font-bold">{title}</p>
      <SongChart chart={chart} columns="1" />
    </div>
  );
}

/** Keeps the screen on while it's shown. */
function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState === "visible")
        navigator.wakeLock
          .request("screen")
          .then((sentinel) => (lock = sentinel))
          .catch(() => undefined);
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, []);
}
