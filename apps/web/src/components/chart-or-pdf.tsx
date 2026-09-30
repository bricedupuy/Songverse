import type { Attachment } from "@songverse/core";
import { FileText, Loader2, Music } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "#/components/ui/card";
import { NativeSelect } from "#/components/ui/native-select";
import { loadPdfjs } from "#/lib/pdfjs";
import { fileLoader, songFiles } from "#/lib/song-files";
import { cn } from "#/lib/utils";

const CHOICE_KEY = "songverse.chartView.";

/** A song's PDFs: its sheet music, its original chart. */
function pdfsOf(attachments: Attachment[]): Attachment[] {
  return attachments.filter((file) => file.type === "PDF" || file.mimeType === "application/pdf");
}

/**
 * A song's chart - or, when it has a PDF, that instead (issue #152): a
 * Chart / PDF switch above it, the choice (and which PDF) remembered for the
 * song on this device. `attachments` when the page has them; else they're
 * listed here (the API's, or the device's copy offline).
 */
export function ChartOrPdf({ songVersionId, attachments, children }: { songVersionId: string; attachments?: Attachment[]; children: ReactNode }) {
  const { t } = useTranslation();
  const [listed, setListed] = useState<{ attachments: Attachment[]; offline: boolean } | null>(null);
  useEffect(() => {
    if (attachments) return;
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

  // "chart", or the PDF shown; remembered for the song.
  const [choice, setChoice] = useState<string>("chart");
  useEffect(() => {
    try {
      setChoice(localStorage.getItem(CHOICE_KEY + songVersionId) ?? "chart");
    } catch {
      // Storage blocked: the chart.
    }
  }, [songVersionId]);
  const choose = (next: string) => {
    setChoice(next);
    try {
      if (next === "chart") localStorage.removeItem(CHOICE_KEY + songVersionId);
      else localStorage.setItem(CHOICE_KEY + songVersionId, next);
    } catch {
      // For this page only.
    }
  };
  const shown = choice === "chart" ? null : (pdfs.find((file) => file.id === choice) ?? (choice === "pdf" ? pdfs[0] : null) ?? null);

  return (
    <div className="flex flex-col gap-3">
      {pdfs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="chart-view">
          <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t("chartView.label")}>
            <button
              type="button"
              aria-pressed={!shown}
              onClick={() => choose("chart")}
              className={cn("flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm [&_svg]:size-4", !shown ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
              data-testid="chart-view-chart"
            >
              <Music />
              {t("chartView.chart")}
            </button>
            <button
              type="button"
              aria-pressed={!!shown}
              onClick={() => choose(shown?.id ?? pdfs[0]!.id)}
              className={cn("flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm [&_svg]:size-4", shown ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
              data-testid="chart-view-pdf"
            >
              <FileText />
              {t("chartView.pdf")}
            </button>
          </div>
          {shown && pdfs.length > 1 ? (
            <NativeSelect compact value={shown.id} onChange={(event) => choose(event.target.value)} aria-label={t("chartView.which")}>
              {pdfs.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.filename}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>
      ) : null}
      {shown ? <PdfPages key={shown.id} load={() => fileLoader(songVersionId, offline)(shown)} name={shown.filename} /> : children}
    </div>
  );
}

/** A PDF's pages, drawn with pdf.js as wide as there's room (sharp on a high-density screen). */
function PdfPages({ load, name }: { load: () => Promise<Blob>; name: string }) {
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
