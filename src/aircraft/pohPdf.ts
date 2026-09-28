import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { chartGroup, dominantTextRotation, type PohPage } from "./pohAnalysis";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function openPoh(
  file: Blob,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (!file.size || file.size > 150 * 1024 * 1024)
    throw new Error("Choose a PDF up to 150 MB.");
  progress("Reading PDF…");
  const data = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", data);
  const sha256 = [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  signal.throwIfAborted();
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 1200)
      throw new Error(
        "This PDF has more than 1,200 pages. Upload the applicable POH section separately.",
      );
    const pages: PohPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      if (number % 10 === 1)
        progress(
          `Finding performance charts · page ${number} / ${pdf.numPages}`,
        );
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) =>
        "str" in item ? [item] : [],
      );
      const text = items.map((item) => item.str).join(" ");
      pages.push({
        page: number,
        text,
        rotation: items.length ? dominantTextRotation(items) : page.rotate,
        group: chartGroup(text),
      });
      page.cleanup();
    }
    return {
      pdf,
      pages,
      sha256,
      destroy: () => {
        signal.removeEventListener("abort", abort);
        void task.destroy();
      },
    };
  } catch (error) {
    signal.removeEventListener("abort", abort);
    await task.destroy();
    throw error;
  }
}

export type OpenPoh = Awaited<ReturnType<typeof openPoh>>;

export async function renderPohPage(
  document: OpenPoh,
  metadata: PohPage,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const page = await document.pdf.getPage(metadata.page);
  const natural = page.getViewport({ scale: 1, rotation: metadata.rotation });
  const viewport = page.getViewport({
    scale: 2200 / Math.max(natural.width, natural.height),
    rotation: metadata.rotation,
  });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not render the PDF page.");
  const task = page.render({ canvasContext: context, viewport });
  const abort = () => task.cancel();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await task.promise;
    signal.throwIfAborted();
    const image = canvas.toDataURL("image/jpeg", 0.9);
    if (image.length > 1200000)
      throw new Error(
        `Page ${metadata.page} is too complex for this request. Upload a cropped performance section.`,
      );
    return image;
  } finally {
    signal.removeEventListener("abort", abort);
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}
