import { disto } from './disto/session.js';
import { esc, formatMm } from './format.js';

export function refreshDistoPills() {
  const html = distoPillInner();
  for (const el of document.querySelectorAll('.disto-pill-body')) el.innerHTML = html;
}

export function distoPillInner() {
  let text = 'DISTO';
  if (disto.status === 'connected') text = disto.last ? formatMm(disto.last.mm) : (disto.model || 'On');
  else if (disto.status === 'simulated') text = disto.last ? formatMm(disto.last.mm) : 'Sim';
  else if (disto.status === 'connecting' || disto.status === 'reconnecting') text = '…';
  else if (disto.status === 'unavailable') text = 'Off';
  return `<span class="dot ${esc(disto.status)}"></span><span>${esc(text)}</span>`;
}

export function topbar({ back, title, titleAction, right = '' }) {
  const backHtml = back
    ? `<button type="button" class="back" data-action="nav" data-href="${esc(back)}" aria-label="Back">‹</button>`
    : '<span class="brand"><span>Orb</span> Survey</span>';
  const titleHtml = title
    ? `<button type="button" class="title-btn" ${titleAction ? `data-action="${esc(titleAction)}"` : 'disabled'}><span class="title-text">${esc(title)}</span></button>`
    : '';
  return `<header class="topbar">${backHtml}${titleHtml}
    <span class="top-actions">${right}</span>
    <button type="button" class="disto-pill" data-action="disto" aria-label="DISTO"><span class="disto-pill-body"></span></button>
  </header>`;
}
