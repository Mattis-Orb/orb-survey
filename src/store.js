import { clearAll, deleteOne, getAll, getOne, putOne } from './db.js';
import { naturalCompare } from './format.js';

const mem = {
  projects: [],
  plots: [],
  entries: [],
};

const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initStore() {
  const [projects, plots, entries] = await Promise.all([
    getAll('projects'),
    getAll('plots'),
    getAll('entries'),
  ]);
  mem.projects = projects;
  mem.plots = plots;
  mem.entries = entries;
}

export function projects() {
  return [...mem.projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id) {
  return mem.projects.find((project) => project.id === id) || null;
}

export function plotsFor(projectId) {
  return mem.plots
    .filter((plot) => plot.projectId === projectId)
    .sort((a, b) => naturalCompare(a.name, b.name));
}

export function getPlot(id) {
  return mem.plots.find((plot) => plot.id === id) || null;
}

export function entriesFor(plotId) {
  return mem.entries
    .filter((entry) => entry.plotId === plotId)
    .sort((a, b) => a.num - b.num || a.createdAt - b.createdAt);
}

export function getEntry(id) {
  return mem.entries.find((entry) => entry.id === id) || null;
}

export function allEntries() {
  return mem.entries;
}

function now() {
  return Date.now();
}

async function touchProject(projectId) {
  const project = getProject(projectId);
  if (!project) return;
  project.updatedAt = now();
  await putOne('projects', project);
}

export async function createProject(name) {
  const project = {
    id: crypto.randomUUID(),
    name: name.trim() || 'New project',
    createdAt: now(),
    updatedAt: now(),
  };
  mem.projects.push(project);
  await putOne('projects', project);
  emit();
  return project;
}

export async function renameProject(id, name) {
  const project = getProject(id);
  if (!project) return;
  project.name = name.trim() || project.name;
  project.updatedAt = now();
  await putOne('projects', project);
  emit();
}

export async function deleteProject(id) {
  const plots = plotsFor(id);
  for (const plot of plots) await deletePlot(plot.id, { silent: true });
  mem.projects = mem.projects.filter((project) => project.id !== id);
  await deleteOne('projects', id);
  emit();
}

export function takenPlotNames(projectId) {
  return new Set(plotsFor(projectId).map((plot) => plot.name));
}

export function uniquePlotName(projectId, base) {
  const names = takenPlotNames(projectId);
  const clean = base.trim() || 'Plot';
  if (!names.has(clean)) return clean;
  let index = 2;
  while (names.has(`${clean} (${index})`)) index += 1;
  return `${clean} (${index})`;
}

export async function addPlot({ projectId, name, projectNumber, pages, activePage, pdfBlob }) {
  const plot = {
    id: crypto.randomUUID(),
    projectId,
    name,
    projectNumber: projectNumber || '',
    status: 'not_started',
    pages,
    activePage,
    createdAt: now(),
    updatedAt: now(),
  };
  mem.plots.push(plot);
  await putOne('plots', plot);
  await putOne('blobs', { id: `pdf:${plot.id}`, blob: pdfBlob });
  await touchProject(projectId);
  emit();
  return plot;
}

export async function renamePlot(id, name) {
  const plot = getPlot(id);
  if (!plot) return;
  plot.name = name.trim() || plot.name;
  plot.updatedAt = now();
  await putOne('plots', plot);
  emit();
}

export async function setPlotStatus(id, status) {
  const plot = getPlot(id);
  if (!plot) return;
  plot.status = status;
  plot.updatedAt = now();
  await putOne('plots', plot);
  await touchProject(plot.projectId);
  emit();
}

export async function setActivePage(id, page) {
  const plot = getPlot(id);
  if (!plot || plot.activePage === page) return;
  plot.activePage = page;
  plot.updatedAt = now();
  await putOne('plots', plot);
  emit();
}

export async function deletePlot(id, { silent = false } = {}) {
  const plot = getPlot(id);
  if (!plot) return;
  const entries = entriesFor(id);
  for (const entry of entries) {
    if (entry.photoId) await deleteOne('blobs', `photo:${entry.photoId}`);
    await deleteOne('entries', entry.id);
  }
  mem.entries = mem.entries.filter((entry) => entry.plotId !== id);
  mem.plots = mem.plots.filter((item) => item.id !== id);
  await deleteOne('blobs', `pdf:${id}`);
  await deleteOne('plots', id);
  if (!silent) {
    await touchProject(plot.projectId);
    emit();
  }
}

function nextNum(plotId) {
  const nums = entriesFor(plotId).map((entry) => entry.num || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

export async function addEntry({ plotId, page, kind, geom, fields, note = '' }) {
  const plot = getPlot(plotId);
  const entry = {
    id: crypto.randomUUID(),
    plotId,
    page,
    kind,
    num: nextNum(plotId),
    geom,
    fields: fields || {},
    note,
    photoId: null,
    createdAt: now(),
    updatedAt: now(),
  };
  mem.entries.push(entry);
  await putOne('entries', entry);
  if (plot && plot.status === 'not_started') {
    plot.status = 'in_progress';
    plot.updatedAt = now();
    await putOne('plots', plot);
    await touchProject(plot.projectId);
  } else if (plot) {
    plot.updatedAt = now();
    await putOne('plots', plot);
  }
  emit();
  return entry;
}

export async function updateEntry(id, patch) {
  const entry = getEntry(id);
  if (!entry) return null;
  if (patch.fields) entry.fields = { ...entry.fields, ...patch.fields };
  if ('note' in patch) entry.note = patch.note;
  if (patch.geom) entry.geom = patch.geom;
  if ('photoId' in patch) entry.photoId = patch.photoId;
  if (patch.page) entry.page = patch.page;
  entry.updatedAt = now();
  await putOne('entries', entry);
  emit();
  return entry;
}

export async function deleteEntry(id) {
  const entry = getEntry(id);
  if (!entry) return;
  if (entry.photoId) await deleteOne('blobs', `photo:${entry.photoId}`);
  mem.entries = mem.entries.filter((item) => item.id !== id);
  await deleteOne('entries', id);
  emit();
}

export async function getBlob(id) {
  const row = await getOne('blobs', id);
  return row?.blob || null;
}

export async function savePhoto(blob) {
  const id = crypto.randomUUID();
  await putOne('blobs', { id: `photo:${id}`, blob });
  return id;
}

export async function putBlob(id, blob) {
  await putOne('blobs', { id, blob });
}

export function snapshot() {
  return {
    projects: mem.projects.map((item) => ({ ...item })),
    plots: mem.plots.map((item) => ({ ...item, pages: item.pages?.map((page) => ({ ...page })) })),
    entries: mem.entries.map((item) => ({
      ...item,
      fields: { ...item.fields },
      geom: { ...item.geom },
    })),
  };
}

export async function replaceFromBackup(data) {
  for (const project of data.projects || []) {
    const index = mem.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) mem.projects[index] = project;
    else mem.projects.push(project);
    await putOne('projects', project);
  }
  for (const plot of data.plots || []) {
    const index = mem.plots.findIndex((item) => item.id === plot.id);
    if (index >= 0) mem.plots[index] = plot;
    else mem.plots.push(plot);
    await putOne('plots', plot);
  }
  for (const entry of data.entries || []) {
    const index = mem.entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) mem.entries[index] = entry;
    else mem.entries.push(entry);
    await putOne('entries', entry);
  }
  emit();
}

export async function eraseEverything() {
  mem.projects = [];
  mem.plots = [];
  mem.entries = [];
  await clearAll();
  emit();
}

export function projectStats(projectId) {
  const plots = plotsFor(projectId);
  return {
    total: plots.length,
    not_started: plots.filter((plot) => plot.status === 'not_started').length,
    in_progress: plots.filter((plot) => plot.status === 'in_progress').length,
    done: plots.filter((plot) => plot.status === 'done').length,
  };
}
