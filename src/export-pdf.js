import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist';
import { closePdf, fractionToPdf } from './pdf.js';
import { entrySummary, kindById } from './kinds.js';
import { formatDay, formatMm, geomText, statusLabel } from './format.js';

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.33, 0.36, 0.4);

function pdfSafe(value) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wrap(text, font, size, width) {
  const words = pdfSafe(text).split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function kindColor(kindId) {
  const hex = kindById(kindId).color.replace('#', '');
  const n = Number.parseInt(hex, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function drawLabel(page, font, text, x, y) {
  const safe = pdfSafe(text);
  if (!safe) return;
  const size = 9;
  const width = font.widthOfTextAtSize(safe, size);
  page.drawRectangle({
    x: x - 2,
    y: y - 3,
    width: width + 6,
    height: size + 6,
    color: rgb(1, 1, 1),
    opacity: 0.9,
  });
  page.drawText(safe, { x, y, size, font, color: INK });
}

function drawEntries(page, entries, viewport, font) {
  for (const entry of entries) {
    const color = kindColor(entry.kind);
    const caption = `#${entry.num} ${pdfSafe(entrySummary(entry))}`;
    const geom = entry.geom || {};
    if (geom.x2 != null) {
      const a = fractionToPdf(viewport, geom.x1, geom.y1);
      const b = fractionToPdf(viewport, geom.x2, geom.y2);
      page.drawLine({ start: a, end: b, thickness: 2.2, color });
      page.drawCircle({ x: a.x, y: a.y, size: 3.5, color });
      page.drawCircle({ x: b.x, y: b.y, size: 3.5, color });
      drawLabel(page, font, caption, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 + 6);
    } else if (geom.w != null) {
      const p = fractionToPdf(viewport, geom.x, geom.y);
      const q = fractionToPdf(viewport, geom.x + geom.w, geom.y + geom.h);
      const x = Math.min(p.x, q.x);
      const y = Math.min(p.y, q.y);
      page.drawRectangle({
        x,
        y,
        width: Math.abs(q.x - p.x),
        height: Math.abs(q.y - p.y),
        borderColor: color,
        borderWidth: 1.6,
        color,
        opacity: 0.16,
      });
      drawLabel(page, font, caption, x + 4, Math.max(p.y, q.y) - 14);
    } else if (geom.x != null) {
      const p = fractionToPdf(viewport, geom.x, geom.y);
      page.drawCircle({ x: p.x, y: p.y, size: 8, color, borderWidth: 1, borderColor: rgb(1, 1, 1) });
      const number = String(entry.num);
      const size = 8;
      const width = font.widthOfTextAtSize(number, size);
      page.drawText(number, {
        x: p.x - width / 2,
        y: p.y - size / 3,
        size,
        font,
        color: rgb(1, 1, 1),
      });
      const labelX = geom.x > 0.72 ? p.x - 8 - font.widthOfTextAtSize(pdfSafe(caption), 9) : p.x + 12;
      drawLabel(page, font, caption, labelX, p.y + 4);
    }
  }
}

function makeWriter(out, font, bold) {
  const state = { page: null, y: 0 };
  function newPage() {
    state.page = out.addPage([PAGE_W, PAGE_H]);
    state.y = PAGE_H - 40;
    state.page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: rgb(0.12, 0.24, 0.3) });
  }
  function ensure(height) {
    if (!state.page || state.y - height < 36) newPage();
  }
  function text(value, { size = 11, face = font, color = INK, gap = 4 } = {}) {
    const lines = wrap(value, face, size, PAGE_W - 72);
    for (const line of lines) {
      ensure(size + gap);
      state.page.drawText(line, { x: 36, y: state.y, size, font: face, color });
      state.y -= size + gap;
    }
  }
  function gap(amount = 8) {
    state.y -= amount;
  }
  newPage();
  return { text, gap, newPage };
}

async function addSchedule(out, font, bold, project, plot, entries, getBlob) {
  const writer = makeWriter(out, font, bold);
  writer.text('Orb Survey', { size: 20, face: bold });
  writer.text(`${project?.name || 'Project'}  ·  ${plot.name}`, { size: 14, face: bold });
  const bits = [
    plot.projectNumber ? `Project number ${plot.projectNumber}` : '',
    `Status: ${statusLabel(plot.status)}`,
    `Exported ${formatDay(Date.now())}`,
  ].filter(Boolean);
  writer.text(bits.join('   '), { size: 11, color: MUTED });
  writer.text('Measurements are in millimetres. Numbers on the plan match this list. Positions are from the top-left of the page.', {
    size: 10,
    color: MUTED,
  });
  writer.gap(8);
  if (!entries.length) {
    writer.text('No measurements recorded.', { size: 12 });
  }
  const pageName = (index) => plot.pages?.find((page) => page.index === index)?.label || `Page ${index}`;
  for (const entry of entries) {
    const kind = kindById(entry.kind);
    writer.text(`#${entry.num}  ${kind.label}  ·  ${pageName(entry.page)}`, { size: 13, face: bold });
    writer.text(entrySummary(entry), { size: 12 });
    if (entry.note && entry.kind !== 'note') writer.text(`Note: ${entry.note}`, { size: 11 });
    const mark = geomText(entry);
    if (mark) writer.text(`On the plan: ${mark}`, { size: 10, color: MUTED });
    if (entry.photoId) writer.text('Photo follows.', { size: 10, color: MUTED });
    writer.gap(6);
  }

  for (const entry of entries) {
    if (!entry.photoId) continue;
    const blob = await getBlob(`photo:${entry.photoId}`);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let image = null;
    try {
      image = await out.embedJpg(bytes);
    } catch {
      try {
        image = await out.embedPng(bytes);
      } catch {
        image = null;
      }
    }
    if (!image) continue;
    const page = out.addPage([PAGE_W, PAGE_H]);
    const kind = kindById(entry.kind);
    page.drawText(pdfSafe(`#${entry.num}  ${kind.label}  ·  ${plot.name}`), {
      x: 36,
      y: PAGE_H - 40,
      size: 16,
      font: bold,
      color: INK,
    });
    const maxW = PAGE_W - 72;
    const maxH = PAGE_H - 100;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: 36, y: PAGE_H - 56 - height, width, height });
  }
}

async function appendPlanPages(out, font, plot, entries, pdfBlob) {
  if (!pdfBlob) return;
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  let source;
  try {
    source = await PDFDocument.load(bytes);
  } catch (error) {
    console.error(error);
    return;
  }
  const wanted = new Set();
  const plan = plot.pages?.find((page) => page.kind === 'plan');
  wanted.add(plan?.index || plot.activePage || 1);
  for (const entry of entries) wanted.add(entry.page);
  const pageCount = source.getPageCount();
  const indexes = [...wanted].filter((index) => index >= 1 && index <= pageCount).sort((a, b) => a - b);
  if (!indexes.length) return;

  const jsDoc = await getDocument({ data: bytes.slice(0) }).promise;
  try {
    for (const pageNumber of indexes) {
      const [page] = await out.copyPages(source, [pageNumber - 1]);
      out.addPage(page);
      const jsPage = await jsDoc.getPage(pageNumber);
      const viewport = jsPage.getViewport({ scale: 1 });
      drawEntries(page, entries.filter((entry) => entry.page === pageNumber), viewport, font);
    }
  } finally {
    await closePdf(jsDoc);
  }
}

export async function buildSurveyPdf({ project, plots, entries, getBlob, onProgress }) {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  out.setTitle(pdfSafe(`${project?.name || 'Survey'} site survey`));
  out.setAuthor('Orb Survey');
  for (let index = 0; index < plots.length; index += 1) {
    const plot = plots[index];
    onProgress?.(`Making the PDF, ${index + 1} of ${plots.length}`);
    const plotEntries = entries
      .filter((entry) => entry.plotId === plot.id)
      .sort((a, b) => a.num - b.num);
    const pdfBlob = await getBlob(`pdf:${plot.id}`);
    await appendPlanPages(out, font, plot, plotEntries, pdfBlob);
    await addSchedule(out, font, bold, project, plot, plotEntries, getBlob);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (out.getPageCount() === 0) {
    const page = out.addPage([PAGE_W, PAGE_H]);
    page.drawText('Nothing to export.', { x: 36, y: PAGE_H - 60, size: 18, font: bold, color: INK });
  }
  return out.save();
}
