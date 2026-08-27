/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  RotateCw,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function PdfChartViewer({ src, title }: { src: string; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError("");
    setDocument(null);
    setPageCount(0);
    setPageNumber(1);

    try {
      const task = pdfjs.getDocument({
        url: `${src}?v=${reloadKey}`,
        withCredentials: false,
      });
      const nextDocument = await task.promise;
      setDocument(nextDocument);
      setPageCount(nextDocument.numPages);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "A PDF betöltése nem sikerült.",
      );
    } finally {
      setLoading(false);
    }
  }, [reloadKey, src]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      const width = element.clientWidth;
      if (width > 0) setViewportWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let cancelled = false;

    async function renderPage() {
      setRendering(true);
      renderTaskRef.current?.cancel();

      try {
        const page = await document!.getPage(pageNumber);
        if (cancelled) return;

        const naturalViewport = page.getViewport({ scale: 1 });
        const baseScale =
          viewportWidth > 0
            ? Math.max(
                0.32,
                Math.min(1.65, (viewportWidth - 24) / naturalViewport.width),
              )
            : 1;
        const scale = baseScale * zoom;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context is not available.");

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        const task = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (nextError) {
        if (
          (nextError as { name?: string }).name !==
          "RenderingCancelledException"
        ) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "A PDF oldal renderelése nem sikerült.",
          );
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, pageNumber, viewportWidth, zoom]);

  return (
    <div className="pdf-chart-viewer">
      <div
        className="pdf-chart-viewer__toolbar"
        aria-label={`${title} vezérlők`}
      >
        <button
          type="button"
          onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
          disabled={pageNumber <= 1 || loading}
          aria-label="Előző PDF oldal"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="pdf-chart-viewer__page">
          {pageCount ? `${pageNumber} / ${pageCount}` : "—"}
        </span>
        <button
          type="button"
          onClick={() =>
            setPageNumber((value) => Math.min(pageCount || 1, value + 1))
          }
          disabled={pageNumber >= pageCount || loading}
          aria-label="Következő PDF oldal"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="pdf-chart-viewer__divider" />
        <button
          type="button"
          onClick={() => setZoom((value) => Math.max(0.55, value - 0.15))}
          disabled={loading}
          aria-label="PDF kicsinyítése"
        >
          <Minus className="size-4" />
        </button>
        <span className="pdf-chart-viewer__zoom">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((value) => Math.min(2.8, value + 0.15))}
          disabled={loading}
          aria-label="PDF nagyítása"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setReloadKey((value) => value + 1);
          }}
          aria-label="PDF újratöltése"
        >
          <RotateCw className="size-4" />
        </button>
      </div>

      <div ref={viewportRef} className="pdf-chart-viewer__stage">
        {loading ? (
          <div className="pdf-chart-viewer__status">
            <Loader2 className="size-5 animate-spin" />
            PDF betöltése…
          </div>
        ) : error ? (
          <div className="pdf-chart-viewer__status is-error">{error}</div>
        ) : (
          <>
            {rendering ? (
              <div className="pdf-chart-viewer__rendering">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : null}
            <canvas ref={canvasRef} aria-label={title} />
          </>
        )}
      </div>
    </div>
  );
}
