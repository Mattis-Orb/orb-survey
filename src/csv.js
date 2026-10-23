import { entrySummary } from './kinds.js';
import { formatWhen, geomText, statusLabel } from './format.js';

const COLUMNS = [
  'Project',
  'Project number',
  'Plot',
  'Status',
  'Page',
  'Number',
  'Type',
  'Detail',
  'Length mm',
  'Position along wall mm',
  'Width mm',
  'Height mm',
  'Height underneath mm',
  'Sill height mm',
  'Note',
  'Photo',
  'Mark on plan',
  'Recorded',
];

function cell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows) {
  const lines = [COLUMNS.map(cell).join(',')];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => cell(row[column])).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function pageLabel(plot, page) {
  return plot?.pages?.find((item) => item.index === page)?.label || `Page ${page}`;
}

export function buildRows({ project, plots, entries }) {
  const rows = [];
  const sortedPlots = [...plots].sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { numeric: true }));
  for (const plot of sortedPlots) {
    const plotEntries = entries
      .filter((entry) => entry.plotId === plot.id)
      .sort((a, b) => a.num - b.num);
    for (const entry of plotEntries) {
      const fields = entry.fields || {};
      rows.push({
        Project: project?.name || '',
        'Project number': plot.projectNumber || '',
        Plot: plot.name,
        Status: statusLabel(plot.status),
        Page: pageLabel(plot, entry.page),
        Number: entry.num,
        Type: entry.kind,
        Detail: fields.subtype || entrySummary(entry),
        'Length mm': fields.lengthMm ?? '',
        'Position along wall mm': fields.alongMm ?? '',
        'Width mm': fields.widthMm ?? '',
        'Height mm': fields.heightMm ?? '',
        'Height underneath mm': fields.heightUnderMm ?? '',
        'Sill height mm': fields.sillMm ?? '',
        Note: entry.note || '',
        Photo: entry.photoId ? 'yes' : '',
        'Mark on plan': geomText(entry),
        Recorded: formatWhen(entry.createdAt),
      });
    }
  }
  return rows;
}
