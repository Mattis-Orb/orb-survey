import { refreshDistoPills, topbar } from './chrome.js';
import { esc, formatDay, statusLabel } from './format.js';
import { entrySummary, kindById, missingLabels } from './kinds.js';
import { entriesFor, getBlob, getPlot, getProject, plotsFor, projectStats, projects } from './store.js';

function paint(html) {
  document.getElementById('app').innerHTML = html;
  refreshDistoPills();
}

function counts(projectId) {
  const stats = projectStats(projectId);
  if (!stats.total) return 'No plans yet';
  return `${stats.total} plot${stats.total === 1 ? '' : 's'} · ${stats.done} done · ${stats.in_progress} in progress`;
}

export function renderHome() {
  const list = projects();
  paint(`<div class="screen">
    ${topbar({})}
    <div class="scroll">
      <div class="page-intro">
        <h1>Projects</h1>
        <p>One project per site. Add the WINNER plans, then walk the plots with the customer and the builders.</p>
      </div>
      <div class="pad">
        <button type="button" class="btn-primary" data-action="new-project">New project</button>
      </div>
      <div class="cards">
        ${list.length ? list.map((project) => `<button type="button" class="project-card" data-action="nav" data-href="#/p/${project.id}">
          <strong>${esc(project.name)}</strong>
          <span>${esc(counts(project.id))}</span>
          <span class="muted">Updated ${esc(formatDay(project.updatedAt))}</span>
        </button>`).join('') : '<p class="empty">No projects yet. Start with the site name, then add the PDFs.</p>'}
      </div>
      <div class="pad stack">
        <button type="button" class="btn-secondary" data-action="backup-all">Back up this phone</button>
        <button type="button" class="btn-secondary" data-action="restore">Restore a backup</button>
        <button type="button" class="btn-ghost" data-action="help">How to use this on site</button>
      </div>
    </div>
  </div>`);
}

export function renderProject(projectId) {
  const project = getProject(projectId);
  if (!project) return false;
  const plots = plotsFor(projectId);
  paint(`<div class="screen">
    ${topbar({ back: '#/', title: project.name, titleAction: 'rename-project' })}
    <div class="scroll">
      <div class="pad stack">
        <button type="button" class="btn-primary" data-action="add-plans">Add WINNER plans</button>
        <div class="btn-row">
          <button type="button" class="btn-secondary" data-action="export-pdf">Share PDF</button>
          <button type="button" class="btn-secondary" data-action="export-csv">Spreadsheet</button>
        </div>
        <button type="button" class="btn-secondary" data-action="backup-project">Back up this project</button>
      </div>
      <div class="cards">
        ${plots.length ? plots.map((plot) => plotCard(plot)).join('') : '<p class="empty">Add the PDF for each plot. The name is taken from the plan, for example “Flat 5 - Design - 1”.</p>'}
      </div>
      <div class="pad">
        <button type="button" class="btn-danger" data-action="delete-project">Delete project</button>
      </div>
    </div>
  </div>`);
  return true;
}

function plotCard(plot) {
  const marks = entriesFor(plot.id);
  const missing = marks.filter((entry) => missingLabels(entry).length).length;
  return `<article class="plot-card">
    <button type="button" class="plot-open" data-action="nav" data-href="#/p/${plot.projectId}/plot/${plot.id}">
      <strong>${esc(plot.name)}</strong>
      <span class="muted">${esc(plot.projectNumber || 'No project number')} · ${marks.length} mark${marks.length === 1 ? '' : 's'}${missing ? ` · ${missing} to fill` : ''}</span>
    </button>
    <div class="seg" role="group" aria-label="Status for ${esc(plot.name)}">
      ${['not_started', 'in_progress', 'done'].map((status) => `<button type="button" data-action="set-status" data-id="${plot.id}" data-status="${status}" class="${plot.status === status ? `on ${status}` : ''}">${statusLabel(status)}</button>`).join('')}
    </div>
  </article>`;
}

const thumbUrls = [];

function revokeThumbs() {
  while (thumbUrls.length) URL.revokeObjectURL(thumbUrls.pop());
}

async function fillThumbs() {
  revokeThumbs();
  for (const img of document.querySelectorAll('img[data-photo]')) {
    const blob = await getBlob(`photo:${img.dataset.photo}`);
    if (!blob || !img.isConnected) continue;
    const url = URL.createObjectURL(blob);
    thumbUrls.push(url);
    img.src = url;
  }
}

export function renderList(projectId, plotId) {
  const project = getProject(projectId);
  const plot = getPlot(plotId);
  if (!project || !plot) return false;
  const marks = entriesFor(plotId);
  const missing = marks.filter((entry) => missingLabels(entry).length).length;
  paint(`<div class="screen">
    ${topbar({
      back: `#/p/${projectId}/plot/${plotId}`,
      title: plot.name,
      right: '<button type="button" class="text-btn" data-action="share-menu">Share</button>',
    })}
    <div class="scroll">
      <div class="page-intro">
        <h1>All marks</h1>
        <p>${missing ? `${missing} still need a measurement.` : marks.length ? 'Everything on this plot has a measurement.' : 'Nothing recorded yet.'}</p>
      </div>
      <div class="cards">
        ${marks.map((entry) => listRow(plot, entry)).join('') || '<p class="empty">Go back to the plan, pick a tool, and tap where you measured.</p>'}
      </div>
      <div class="pad">
        <button type="button" class="btn-danger" data-action="delete-plot">Remove this plot</button>
      </div>
    </div>
  </div>`);
  fillThumbs();
  return true;
}

function listRow(plot, entry) {
  const kind = kindById(entry.kind);
  const page = plot.pages?.find((item) => item.index === entry.page);
  const missing = missingLabels(entry);
  return `<button type="button" class="list-row" data-action="open-entry" data-id="${entry.id}">
    <span class="pin-num" style="background:${kind.color}">${entry.num}</span>
    <span class="list-copy">
      <strong>${esc(kind.label)}</strong>
      <span>${esc(missing.length ? `Needs ${missing.join(', ')}` : entrySummary(entry))}</span>
      <span class="muted">${esc(page?.label || `Page ${entry.page}`)}</span>
    </span>
    ${entry.photoId ? `<img class="thumb" alt="" data-photo="${esc(entry.photoId)}">` : ''}
  </button>`;
}
