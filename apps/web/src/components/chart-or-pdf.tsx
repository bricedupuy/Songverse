import type { Attachment, ChartPreferences, LiveViewValue } from "@songverse/core";
import { FileText, Loader2, Music } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "#/components/ui/card";
import { NativeSelect } from "#/components/ui/native-select";
import { apiClient } from "#/lib/api-client";
import { loadPdfjs } from "#/lib/pdfjs";
import { fileLoader, songFiles } from "#/lib/song-files";
import { cn } from "#/lib/utils";

/** A song's PDFs: its sheet music, its original chart. */
function pdfsOf(attachments: Attachment[]): Attachment[] {
  return attachments.filter((file) => file.type === "PDF" || file.mimeType === "application/pdf");
}

type ViewChoice = Pick<ChartPreferences, "view" | "pdfId">;

/**
 * Where a player's choice of view for a song is kept (issue #155): with
 * their chart preferences, on the server - for a song of a set, as the set
 * plays it; else the song as written. A field left out keeps its value.
 */
export interface ViewStore {
  /** Known already (a set's song view carries it); else loaded. */
  initial?: ViewChoice | null;
  load?: () => Promise<ViewChoice | null>;
  save: (choice: ViewChoice) => Promise<unknown>;
}

export function setSongViewStore(setId: string, itemId: string, initial: ChartPreferences | null | undefined): ViewStore {
  return { initial: initial ?? null, save: (choice) => apiClient.setSetlistChartPreferences(setId, itemId, choice) };
}

export function songViewStore(songVersionId: string): ViewStore {
  return {
    load: () => apiClient.getChartPreferences(songVersionId),
    save: (choice) => apiClient.saveChartPreferences(songVersionId, null, choice),
  };
}

/** How a player reads a song, chosen for it or else their default: its chart, or one of its PDFs - the chart when it has none. */
export interface ReadingView {
  pdfs: Attachment[];
  /** The PDF shown; null: the chart. */
  shown: Attachment | null;
  choose: (view: LiveViewValue, pdfId?: string) => void;
  load: (file: Attachment) => Promise<Blob>;
}

/**
 * The view a player reads a song in (issue #155), in Practice and in Live
 * alike: as chosen for the song, else their default (account settings).
 * `attachments` when the page has them; else they're listed here (the API's,
 * or the device's copy offline).
 */
export function useReadingView(songVersionId: string, attachments: Attachment[] | undefined, defaultView: LiveViewValue, store: ViewStore): ReadingView {
  const [listed, setListed] = useState<{ attachments: Attachment[]; offline: boolean } | null>(null);
  useEffect(() => {
    // A song hidden from this player (a set's): nothing to list.
    if (attachments || !songVersionId) return;
    let cancelled = false;
    songFiles(songVersionId)
      .then((files) => {
        if (!cancelled) setListed(files);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [songVersionId, attachments]);
  const pdfs = pdfsOf(attachments ?? listed?.attachments ?? []);
  const offline = !attachments && !!listed?.offline;

  const [choice, setChoice] = useState<ViewChoice | null>(store.initial ?? null);
  const initialKey = JSON.stringify([store.initial?.view, store.initial?.pdfId]);
  useEffect(() => {
    setChoice(store.initial ?? null);
    if (!store.load || !songVersionId) return;
    let cancelled = false;
    store
      .load()
      .then((saved) => {
        if (!cancelled && saved) setChoice({ view: saved.view, pdfId: saved.pdfId });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Another song, or its saved choice changed (the page reloaded it).
  }, [songVersionId, initialKey]);

  const view = choice?.view ?? defaultView;
  const shown = view === "PDF" ? (pdfs.find((file) => file.id === choice?.pdfId) ?? pdfs[0] ?? null) : null;
  return {
    pdfs,
    shown,
    choose: (next, pdfId) => {
      const change: ViewChoice = next === "PDF" ? { view: next, ...(pdfId ? { pdfId } : {}) } : { view: next };
      setChoice((before) => ({ ...before, ...change }));
      // Offline, it holds for this page.
      store.save(change).catch(() => {});
    },
    load: (file) => fileLoader(songVersionId, offline)(file),
  };
}

/** The Chart / PDF switch, and which PDF when there are several; nothing when the song has no PDF. */
export function ViewSwitch({ reading, compact = false }: { reading: ReadingView; compact?: boolean }) {
  const { t } = useTranslation();
  const { pdfs, shown, choose } = reading;
  if (pdfs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="chart-view">
      <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t("chartView.label")}>
        <button
          type="button"
          aria-pressed={!shown}
          onClick={() => choose("CHART")}
          className={cn("flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm [&_svg]:size-4", !shown ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
          title={compact ? t("chartView.chart") : undefined}
          data-testid="chart-view-chart"
        >
          <Music />
          <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{t("chartView.chart")}</span>
        </button>
        <button
          type="button"
          aria-pressed={!!shown}
          onClick={() => choose("PDF", shown?.id ?? pdfs[0]!.id)}
          className={cn("flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm [&_svg]:size-4", shown ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
          title={compact ? t("chartView.pdf") : undefined}
          data-testid="chart-view-pdf"
        >
          <FileText />
          <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{t("chartView.pdf")}</span>
        </button>
      </div>
      {shown && pdfs.length > 1 && !compact ? (
        <NativeSelect compact value={shown.id} onChange={(event) => choose("PDF", event.target.value)} aria-label={t("chartView.which")}>
          {pdfs.map((file) => (
            <option key={file.id} value={file.id}>
              {file.filename}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </div>
  );
}

/**
 * A song's chart - or, when the player reads it as a PDF, that instead
 * (issues #152, #155): the switch above it, the choice kept with their
 * chart preferences, so Live shows the same.
 */
export function ChartOrPdf({
  songVersionId,
  attachments,
  defaultView,
  store,
  children,
}: {
  songVersionId: string;
  attachments?: Attachment[];
  defaultView: LiveViewValue;
  store: ViewStore;
  children: ReactNode;
}) {
  const reading = useReadingView(songVersionId, attachments, defaultView, store);
  const { shown } = reading;
  return (
    <div className="flex flex-col gap-3">
      <ViewSwitch reading={reading} />
      {shown ? <PdfPages key={shown.id} load={() => reading.load(shown)} name={shown.filename} /> : children}
    </div>
  );
}

/** A PDF's pages, drawn with pdf.js as wide as there's room (sharp on a high-density screen). */
export function PdfPages({ load, name }: { load: () => Promise<Blob>; name: string }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || width === 0) return;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ data: new Uint8Array(await (await load()).arrayBuffer()) });
        destroy = () => void task.destroy();
        const pdf = await task.promise;
        if (cancelled) return;
        const canvases: HTMLCanvasElement[] = [];
        for (let number = 1; number <= pdf.numPages; number++) {
          const page = await pdf.getPage(number);
          const scale = width / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "w-full rounded-md border bg-white shadow-sm";
          canvas.setAttribute("aria-label", t("chartView.page", { page: number, pages: pdf.numPages }));
          canvas.setAttribute("role", "img");
          canvas.dataset.testid = "pdf-page";
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }
        el.replaceChildren(...canvases);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
    // Drawn again when the room changes; `load` is the same file for this component (keyed by it).
  }, [width]);

  return (
    <div className="flex flex-col gap-2" data-testid="pdf-view" data-state={state}>
      {state === "loading" ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("chartView.loading", { name })}
          </CardContent>
        </Card>
      ) : null}
      {state === "failed" ? <p className="text-sm text-destructive">{t("chartView.failed", { name })}</p> : null}
      <div ref={box} className="flex flex-col gap-3" />
    </div>
  );
}
