import { showToast } from './dialogs.js';
import { esc, formatMm } from './format.js';
import { entrySummary, kindById, missingLabels } from './kinds.js';
import { cleanMm, setFocused, updateShotHint } from './readings.js';
import { deleteEntry, getBlob, getEntry, savePhoto, updateEntry } from './store.js';

let openId = null;
let photoUrl = null;

export function editorEntryId() {
  return openId;
}

export function closeEditor() {
  openId = null;
  setFocused(null);
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  document.getElementById('editor-sheet').innerHTML = '';
}

async function photoHtml(entry) {
  const slot = document.querySelector('#editor-photo-slot');
  if (!slot) return;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  if (!entry.photoId) {
    slot.innerHTML = '';
    return;
  }
  const blob = await getBlob(`photo:${entry.photoId}`);
  if (!blob) {
    slot.innerHTML = '';
    return;
  }
  photoUrl = URL.createObjectURL(blob);
  slot.innerHTML = `<img alt="Photo for this mark" src="${photoUrl}">`;
}

export function openEditor(id) {
  const entry = getEntry(id);
  if (!entry) return;
  openId = id;
  const kind = kindById(entry.kind);
  const missing = missingLabels(entry);
  const root = document.getElementById('editor-sheet');
  root.innerHTML = `<div class="backdrop" data-action="close-editor"></div>
    <section class="sheet" role="dialog" aria-label="${esc(kind.label)}">
      <div class="sheet-handle"></div>
      <header class="sheet-head">
        <div>
          <p class="eyebrow" style="color:${kind.color}">#${entry.num} ${esc(kind.label)}</p>
          <h2>${esc(entrySummary(entry))}</h2>
        </div>
        <button type="button" class="btn-primary sheet-close" data-action="close-editor">Close</button>
      </header>
      <p class="saved-line">Saved on this phone${missing.length ? ` · still needed: ${esc(missing.join(', '))}` : ''}</p>
      ${kind.fields.map((field) => fieldHtml(entry, field)).join('')}
      <div class="shot-hint" hidden></div>
      <label class="stack-label">Note for the office
        <textarea data-note rows="${entry.kind === 'note' ? 5 : 3}" placeholder="Anything that is not on the plan">${esc(entry.note || '')}</textarea>
      </label>
      <div id="editor-photo-slot"></div>
      <div class="btn-row">
        <button type="button" class="btn-secondary" data-action="take-photo">Take photo</button>
        <button type="button" class="btn-secondary" data-action="choose-photo">Choose photo</button>
      </div>
      ${entry.photoId ? '<button type="button" class="btn-ghost" data-action="remove-photo">Remove photo</button>' : ''}
      <button type="button" class="btn-danger" data-action="delete-entry">Delete this mark</button>
    </section>`;
  photoHtml(entry);
  const first = root.querySelector('[data-measure]');
  if (first) {
    setTimeout(() => {
      if (openId !== id) return;
      first.focus();
      setFocused(first);
      updateShotHint();
    }, 60);
  }
}

function fieldHtml(entry, field) {
  if (field.type === 'choice') {
    const current = entry.fields?.[field.key] || field.default;
    return `<div class="field">
      <span class="field-label">${esc(field.label)}</span>
      <div class="choices">
        ${field.options.map((option) => `<button type="button" data-action="pick-choice" data-key="${esc(field.key)}" data-value="${esc(option)}" class="${option === current ? 'on' : ''}">${esc(option)}</button>`).join('')}
      </div>
    </div>`;
  }
  const value = entry.fields?.[field.key];
  return `<label class="measure">
    <span class="field-label">${esc(field.label)}</span>
    <span class="measure-row">
      <input data-measure data-key="${esc(field.key)}" ${field.prefer ? `data-prefer="${field.prefer}"` : ''} inputmode="numeric" enterkeyhint="done" value="${value == null ? '' : formatMm(value).replace(/,/g, '')}" />
      <span class="unit">mm</span>
    </span>
    ${field.hint ? `<span class="field-hint">${esc(field.hint)}</span>` : ''}
  </label>`;
}

export function bindEditor() {
  const root = document.getElementById('editor-sheet');
  root.addEventListener('input', (event) => {
    const entry = getEntry(openId);
    if (!entry) return;
    const target = event.target;
    if (target.matches('[data-measure]')) {
      const cleaned = cleanMm(target.value);
      if (cleaned !== target.value) target.value = cleaned;
      const value = cleaned === '' || cleaned === '-' ? null : Number(cleaned);
      updateEntry(entry.id, { fields: { [target.dataset.key]: value } });
      const summary = root.querySelector('.sheet-head h2');
      if (summary) summary.textContent = entrySummary(getEntry(entry.id));
    } else if (target.matches('[data-note]')) {
      updateEntry(entry.id, { note: target.value });
    }
  });
  root.addEventListener('focusin', (event) => {
    if (event.target.matches('[data-measure]')) {
      setFocused(event.target);
      updateShotHint();
    }
  });
}

export async function setEntryPhoto(file) {
  const entry = getEntry(openId);
  if (!entry || !file) return;
  const blob = await compressImage(file);
  if (!blob) {
    showToast('Could not use that photo. Try another.');
    return;
  }
  const photoId = await savePhoto(blob);
  const previous = entry.photoId;
  await updateEntry(entry.id, { photoId });
  if (previous) {
    const { deleteOne } = await import('./db.js');
    await deleteOne('blobs', `photo:${previous}`);
  }
  await photoHtml(getEntry(entry.id));
  const remove = document.querySelector('[data-action="remove-photo"]');
  if (!remove) {
    const danger = document.querySelector('#editor-sheet .btn-danger');
    danger?.insertAdjacentHTML('beforebegin', '<button type="button" class="btn-ghost" data-action="remove-photo">Remove photo</button>');
  }
}

export async function removeEntryPhoto() {
  const entry = getEntry(openId);
  if (!entry?.photoId) return;
  const { deleteOne } = await import('./db.js');
  await deleteOne('blobs', `photo:${entry.photoId}`);
  await updateEntry(entry.id, { photoId: null });
  await photoHtml(getEntry(entry.id));
  document.querySelector('[data-action="remove-photo"]')?.remove();
}

async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    return blob;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function removeOpenEntry() {
  if (!openId) return;
  const id = openId;
  closeEditor();
  await deleteEntry(id);
}
