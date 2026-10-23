import { esc } from './format.js';

const modal = () => document.getElementById('modal');
const toast = () => document.getElementById('toast');
let toastTimer = 0;

export function showToast(message, action) {
  const el = toast();
  const actionHtml = action
    ? `<button type="button" class="toast-action">${esc(action.label)}</button>`
    : '';
  el.innerHTML = `<span>${esc(message)}</span>${actionHtml}`;
  el.hidden = false;
  const button = el.querySelector('button');
  if (button && action) {
    button.addEventListener('click', () => {
      el.hidden = true;
      action.run();
    });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, action ? 6000 : 3200);
}

export function showBusy(message) {
  const el = modal();
  el.hidden = false;
  el.innerHTML = `<div class="scrim"><div class="modal card"><p class="busy">${esc(message)}</p></div></div>`;
}

export function setBusy(message) {
  const busy = modal().querySelector('.busy');
  if (busy) busy.textContent = message;
  else showBusy(message);
}

export function hideBusy() {
  const el = modal();
  if (!el.querySelector('.busy')) return;
  el.hidden = true;
  el.innerHTML = '';
}

export function confirmDialog({ title, body, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const el = modal();
    el.hidden = false;
    el.innerHTML = `<div class="scrim"><div class="modal card" role="dialog">
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      <div class="btn-row">
        <button type="button" class="btn-secondary" data-cancel>Cancel</button>
        <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>
      </div>
    </div></div>`;
    const close = (value) => {
      el.hidden = true;
      el.innerHTML = '';
      resolve(value);
    };
    el.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    el.querySelector('[data-ok]').addEventListener('click', () => close(true));
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'Save' }) {
  return new Promise((resolve) => {
    const el = modal();
    el.hidden = false;
    el.innerHTML = `<div class="scrim"><form class="modal card" role="dialog">
      <h2>${esc(title)}</h2>
      <label class="stack-label">${esc(label)}
        <input name="value" value="${esc(value)}" placeholder="${esc(placeholder)}" />
      </label>
      <div class="btn-row">
        <button type="button" class="btn-secondary" data-cancel>Cancel</button>
        <button type="submit" class="btn-primary">${esc(confirmLabel)}</button>
      </div>
    </form></div>`;
    const input = el.querySelector('input');
    const close = (next) => {
      el.hidden = true;
      el.innerHTML = '';
      resolve(next);
    };
    el.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    el.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      close(input.value);
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  });
}

export function chooseDialog({ title, options }) {
  return new Promise((resolve) => {
    const el = modal();
    el.hidden = false;
    el.innerHTML = `<div class="scrim"><div class="modal card" role="dialog">
      <h2>${esc(title)}</h2>
      <div class="choice-list">
        ${options.map((option) => `<button type="button" class="btn-secondary" data-id="${esc(option.id)}">${esc(option.label)}</button>`).join('')}
        <button type="button" class="btn-ghost" data-cancel>Cancel</button>
      </div>
    </div></div>`;
    const close = (value) => {
      el.hidden = true;
      el.innerHTML = '';
      resolve(value);
    };
    el.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    for (const button of el.querySelectorAll('[data-id]')) {
      button.addEventListener('click', () => close(button.dataset.id));
    }
  });
}

export function helpDialog() {
  const el = modal();
  el.hidden = false;
  el.innerHTML = `<div class="scrim"><div class="modal card help" role="dialog">
    <h2>On site</h2>
    <ol>
      <li>Create a project for the site, then add the WINNER PDFs. One file, one plot.</li>
      <li>Open a plot. It starts on the plan.</li>
      <li>Connect the DISTO. On the laser: Bluetooth on, Autosend on, Keyboard mode off.</li>
      <li>Pick a tool, tap the plan, and press measure. The number drops into the box. You can always type it.</li>
      <li>Add a photo if the office needs to see the beam, stack, or pipe.</li>
      <li>Mark the plot Done before you leave the room. The list shows anything still missing a number.</li>
      <li>Back at the office, share the PDF and the spreadsheet. Back up the phone at the end of the day.</li>
    </ol>
    <p class="field-hint">Everything stays on this phone. There is no account. Clearing the browser site data deletes the survey, so keep a backup.</p>
    <button type="button" class="btn-primary" data-close>Close</button>
    <button type="button" class="btn-danger" data-erase>Erase everything on this phone</button>
  </div></div>`;
  return new Promise((resolve) => {
    const close = (erase) => {
      el.hidden = true;
      el.innerHTML = '';
      resolve(erase);
    };
    el.querySelector('[data-close]').addEventListener('click', () => close(false));
    el.querySelector('[data-erase]').addEventListener('click', () => close('erase'));
  });
}
