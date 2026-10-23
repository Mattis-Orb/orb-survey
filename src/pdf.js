import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export async function inspectPdf(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  try {
    const texts = [];
    for (let index = 1; index <= doc.numPages; index += 1) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      texts.push(content.items.map((item) => item.str || '').join(' '));
    }
    return { pageCount: doc.numPages, texts };
  } finally {
    await doc.destroy();
  }
}

export async function loadPdf(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = getDocument({ data });
  return task.promise;
}

/** Render a page sharp enough to pinch-zoom on a phone. CSS size stays in PDF points. */
export async function renderPage(doc, pageNumber, canvas) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 2200 / base.width);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return { cssWidth: base.width, cssHeight: base.height, viewport: base };
}

export function fractionToPdf(viewport, fx, fy) {
  const [x, y] = viewport.convertToPdfPoint(fx * viewport.width, fy * viewport.height);
  return { x, y };
}
