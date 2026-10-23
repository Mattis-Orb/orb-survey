export function formatMm(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Math.round(number).toLocaleString('en-GB');
}

export function formatWhen(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDay(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true, sensitivity: 'base' });
}

export function slug(name) {
  const text = String(name || '')
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '');
  return text.slice(0, 80) || 'survey';
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

export function geomText(entry) {
  const geom = entry?.geom || {};
  const pct = (number) => `${Math.round(Number(number) * 1000) / 10}%`;
  if (geom.x2 != null) return `${pct(geom.x1)},${pct(geom.y1)} to ${pct(geom.x2)},${pct(geom.y2)}`;
  if (geom.w != null) return `${pct(geom.x)},${pct(geom.y)} size ${pct(geom.w)} × ${pct(geom.h)}`;
  if (geom.x != null) return `${pct(geom.x)},${pct(geom.y)}`;
  return '';
}

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

export function statusLabel(status) {
  return STATUS_LABEL[status] || 'Not started';
}
