import { esc, formatMm } from './format.js';
import { saveSettings } from './settings.js';
import {
  clearSpan,
  disto,
  fromFloorMm,
  markPoint,
} from './disto/session.js';

function tiltText(degrees) {
  if (degrees == null || !Number.isFinite(degrees)) return '';
  const offVertical = Math.abs(90 - Math.abs(degrees));
  if (offVertical <= 25) return `${offVertical.toFixed(0)}° off vertical`;
  return `${Math.abs(degrees).toFixed(0)}° from level`;
}

function statusLine() {
  if (disto.status === 'connected') {
    const bits = [`Connected to ${disto.deviceName || 'DISTO'}`];
    if (disto.model) bits.push(disto.model);
    if (disto.firmware) bits.push(disto.firmware);
    if (disto.battery != null) bits.push(`${disto.battery}% battery`);
    return bits.join(' · ');
  }
  if (disto.status === 'simulated') return 'Practice mode. These numbers are not from the laser.';
  if (disto.status === 'connecting') return 'Connecting…';
  if (disto.status === 'reconnecting') return 'Connection dropped. Trying again…';
  if (disto.status === 'unavailable') return 'This browser has no Bluetooth. Use Chrome on Android, or practise below.';
  return disto.error || 'Not connected.';
}

function readoutHtml() {
  const last = disto.last;
  if (!last) {
    return '<p class="live-readout empty">No shot yet. Press measure on the DISTO.</p>';
  }
  const floor = fromFloorMm(last);
  const chips = [
    `<button type="button" data-action="use-reading" data-which="distance">Distance ${formatMm(last.mm)}</button>`,
    `<button type="button" data-action="use-reading" data-which="horizontal">Horizontal ${formatMm(last.horizontalMm)}</button>`,
    `<button type="button" data-action="use-reading" data-which="vertical">Vertical ${formatMm(last.verticalMm)}</button>`,
  ];
  if (disto.offsetMm) {
    chips.push(`<button type="button" data-action="use-reading" data-which="floor">From floor ${formatMm(floor)}</button>`);
  }
  if (disto.span) {
    chips.push(`<button type="button" data-action="use-reading" data-which="span">Between points ${formatMm(disto.span.distanceMm)}</button>`);
  }
  return `<div class="live-readout">
    <p class="big-mm">${formatMm(last.mm)} <span>mm</span></p>
    <p class="tilt">${esc(tiltText(last.inclinationDeg))}${last.hasStand ? ' · stand angles' : ''}</p>
    <div class="chips">${chips.join('')}</div>
    <p class="span-line">${disto.pointA ? 'Point A set' : 'Point A not set'} · ${disto.pointB ? 'Point B set' : 'Point B not set'}${disto.span ? ` · height difference ${formatMm(disto.span.verticalMm)} mm` : ''}</p>
  </div>`;
}

export function distoSheetOpen() {
  return Boolean(document.querySelector('#disto-sheet .sheet'));
}

export function refreshDistoSheet() {
  const live = document.querySelector('#disto-sheet .live-slot');
  if (live) live.innerHTML = readoutHtml();
  const status = document.querySelector('#disto-sheet .status-line');
  if (status) status.textContent = statusLine();
}

export function closeDistoSheet() {
  document.getElementById('disto-sheet').innerHTML = '';
}

export function openDistoSheet() {
  const root = document.getElementById('disto-sheet');
  const connected = disto.status === 'connected';
  const simulated = disto.status === 'simulated';
  root.innerHTML = `<div class="backdrop" data-action="close-disto"></div>
    <section class="sheet disto-sheet" role="dialog" aria-label="DISTO">
      <div class="sheet-handle"></div>
      <header class="sheet-head">
        <div>
          <p class="eyebrow">Leica DISTO</p>
          <h2>${connected ? 'Connected' : simulated ? 'Practice' : 'Laser'}</h2>
        </div>
        <button type="button" class="btn-primary sheet-close" data-action="close-disto">Close</button>
      </header>
      <p class="status-line">${esc(statusLine())}</p>
      <p class="field-hint">On the DISTO: Bluetooth on, Autosend on, Keyboard mode off. Distance can stay in metres — this app records millimetres.</p>
      <div class="btn-row">
        ${connected
          ? '<button type="button" class="btn-secondary" data-action="disconnect-disto">Disconnect</button><button type="button" class="btn-secondary" data-action="remote-measure">Measure</button>'
          : '<button type="button" class="btn-primary" data-action="connect-disto">Connect DISTO</button>'}
      </div>
      ${simulated
        ? '<button type="button" class="btn-ghost" data-action="stop-sim">Leave practice mode</button>'
        : '<button type="button" class="btn-ghost" data-action="start-sim">Practise without the laser</button>'}
      <div class="live-slot">${readoutHtml()}</div>
      <div class="btn-row">
        <button type="button" class="btn-secondary" data-action="mark-a">Point A</button>
        <button type="button" class="btn-secondary" data-action="mark-b">Point B</button>
        <button type="button" class="btn-ghost" data-action="clear-span">Clear</button>
      </div>
      <p class="field-hint">With the DST 360-X, leave the stand still and take two shots. Point A and Point B give the distance between them. A plain wall shot does not need the stand.</p>
      <label class="measure">
        <span class="field-label">Height of the DISTO above the floor</span>
        <span class="measure-row">
          <input data-offset inputmode="numeric" value="${disto.offsetMm || ''}" placeholder="0" />
          <span class="unit">mm</span>
        </span>
        <span class="field-hint">Only used for the “from floor” button. Leave blank if you shoot from the floor.</span>
      </label>
      <div class="sim-box" ${simulated ? '' : 'hidden'}>
        <p class="field-label">Simulated shot</p>
        <label class="stack-label">Distance mm
          <input data-sim="mm" inputmode="numeric" value="${disto.sim.mm}" />
        </label>
        <label class="stack-label">Tilt from level (degrees, 90 is straight up)
          <input data-sim="tiltDeg" inputmode="numeric" value="${disto.sim.tiltDeg}" />
        </label>
        <label class="check"><input data-sim="useStand" type="checkbox" ${disto.sim.useStand ? 'checked' : ''}/> Include stand angles</label>
        <div class="btn-row">
          <label class="stack-label">Azimuth °<input data-sim="azimuthDeg" inputmode="numeric" value="${disto.sim.azimuthDeg}" /></label>
          <label class="stack-label">Zenith °<input data-sim="zenithDeg" inputmode="numeric" value="${disto.sim.zenithDeg}" /></label>
        </div>
        <button type="button" class="btn-primary" data-action="sim-measure">Press measure</button>
      </div>
    </section>`;
  const sheet = root.querySelector('.sheet');
  sheet.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-sim]')) {
      const key = target.dataset.sim;
      if (target.type === 'checkbox') disto.sim[key] = target.checked;
      else disto.sim[key] = target.value === '' ? 0 : Number(target.value);
    }
    if (target.matches('[data-offset]')) {
      const mm = target.value.trim() === '' ? 0 : Number(target.value.replace(/[^\d]/g, ''));
      disto.offsetMm = Number.isFinite(mm) ? mm : 0;
      saveSettings({ offsetMm: disto.offsetMm });
      refreshDistoSheet();
    }
  });
}

export function rememberMark(which) {
  if (!markPoint(which)) return false;
  refreshDistoSheet();
  return true;
}

export function forgetSpan() {
  clearSpan();
  refreshDistoSheet();
}
