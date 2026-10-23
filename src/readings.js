import { showToast } from './dialogs.js';
import { disto, readingValue } from './disto/session.js';
import { formatMm } from './format.js';

let focused = null;

export function setFocused(element) {
  focused = element && element.isConnected ? element : null;
}

function cleanMm(value) {
  const text = String(value).replace(/[^\d-]/g, '');
  const negative = text.startsWith('-');
  const digits = text.replace(/-/g, '');
  if (!digits) return '';
  return negative ? `-${digits}` : digits;
}

export function writeMeasureInput(input, value) {
  input.value = cleanMm(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.classList.add('flash');
  setTimeout(() => input.classList.remove('flash'), 700);
}

function advance(from) {
  const fields = [...document.querySelectorAll('#editor-sheet [data-measure]')];
  const index = fields.indexOf(from);
  for (let i = index + 1; i < fields.length; i += 1) {
    if (!fields[i].value) {
      fields[i].focus();
      focused = fields[i];
      return;
    }
  }
}

export function applyReading(which, { quiet = false } = {}) {
  const value = readingValue(which);
  if (value == null) {
    if (!quiet) showToast('No reading yet. Press measure on the DISTO.');
    return false;
  }
  const active = document.activeElement;
  if (active?.matches?.('textarea, [data-sim], [data-offset]')) {
    if (!quiet) showToast(`${formatMm(value)} mm — tap a measurement box to use it`);
    return false;
  }
  let input = focused && focused.isConnected ? focused : null;
  if (!input?.matches?.('[data-measure]')) {
    if (active?.matches?.('[data-measure]')) input = active;
  }
  if (!input?.matches?.('[data-measure]')) {
    const editorOpen = document.querySelector('#editor-sheet .sheet');
    input = editorOpen ? document.querySelector('#editor-sheet [data-measure]') : null;
  }
  if (!input) {
    if (!quiet) showToast(`${formatMm(value)} mm — tap a measurement box first`);
    return false;
  }
  focused = input;
  writeMeasureInput(input, value);
  advance(input);
  updateShotHint();
  navigator.vibrate?.(12);
  return true;
}

export function updateShotHint() {
  const hint = document.querySelector('#editor-sheet .shot-hint');
  if (!hint) return;
  const prefer = focused?.dataset?.prefer;
  const last = disto.last;
  if (!last || !prefer) {
    hint.hidden = true;
    hint.innerHTML = '';
    return;
  }
  const alternate = prefer === 'vertical' ? last.verticalMm : last.horizontalMm;
  if (alternate == null || Math.abs(alternate - last.mm) < 15) {
    hint.hidden = true;
    hint.innerHTML = '';
    return;
  }
  const label = prefer === 'vertical' ? 'vertical height' : 'horizontal distance';
  hint.hidden = false;
  hint.innerHTML = `This shot is angled. <button type="button" data-action="use-reading" data-which="${prefer}">Use ${label} ${formatMm(alternate)} mm</button>`;
}

export { cleanMm };
