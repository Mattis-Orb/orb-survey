import { makeBackup, restoreBackup } from './backup.js';
import { refreshDistoPills } from './chrome.js';
import {
  chooseDialog,
  confirmDialog,
  helpDialog,
  hideBusy,
  promptDialog,
  setBusy,
  showBusy,
  showToast,
} from './dialogs.js';
import {
  closeDistoSheet,
  distoSheetOpen,
  forgetSpan,
  openDistoSheet,
  refreshDistoSheet,
  rememberMark,
} from './disto-ui.js';
import {
  disconnectDevice,
  disto,
  onDisto,
  remoteMeasure,
  requestDevice,
  simulateShot,
  startSimulate,
  stopSimulate,
} from './disto/session.js';
import {
  closeEditor,
  openEditor,
  removeEntryPhoto,
  removeOpenEntry,
  setEntryPhoto,
} from './editor.js';
import { buildSurveyPdf } from './export-pdf.js';
import { slug } from './format.js';
import { inspectPdf } from './pdf.js';
import { mountPlan } from './plan.js';
import { applyReading, updateShotHint } from './readings.js';
import { renderHome, renderList, renderProject } from './screens.js';
import { loadSettings, saveSettings } from './settings.js';
import { shareFiles } from './share.js';
import {
  addPlot,
  createProject,
  deletePlot,
  deleteProject,
  entriesFor,
  eraseEverything,
  getPlot,
  getProject,
  plotsFor,
  renamePlot,
  renameProject,
  setPlotStatus,
  subscribe,
  uniquePlotName,
} from './store.js';
import { buildRows, toCsv } from './csv.js';
import { defaultPage, labelPages, mergeWinner, nameFromFilename } from './winner.js';

let route = { name: 'home' };
let controller = null;
let deferredPrompt = null;
let importProjectId = null;

function parse() {
  const parts = (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1] && parts[2] === 'plot' && parts[3]) {
    if (parts[4] === 'list') return { name: 'list', projectId: parts[1], plotId: parts[3] };
    return { name: 'plan', projectId: parts[1], plotId: parts[3] };
  }
  if (parts[0] === 'p' && parts[1]) return { name: 'project', projectId: parts[1] };
  return { name: 'home' };
}

function routeKey(next) {
  return `${next.name}:${next.projectId || ''}:${next.plotId || ''}`;
}

function go(hash) {
  const current = location.hash || '#/';
  if (current !== hash) location.hash = hash;
}

function clearController() {
  controller?.destroy?.();
  controller = null;
}

function syncInstall(name) {
  const bar = document.getElementById('install-bar');
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const show = Boolean(deferredPrompt)
    && !standalone
    && name !== 'plan'
    && name !== 'list'
    && !sessionStorage.getItem('orb-install-hide');
  if (!show) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  if (!bar.querySelector('[data-action="install"]')) {
    bar.innerHTML = `<span>Install on this phone so it works with no signal.</span>
      <button type="button" data-action="install">Install</button>
      <button type="button" data-action="hide-install">Not now</button>`;
  }
}

function render({ fromHash = false } = {}) {
  const next = parse();
  const key = routeKey(next);
  if (fromHash) {
    closeEditor();
    closeDistoSheet();
  }
  route = next;
  if (next.name === 'plan') {
    if (controller?.key === key) {
      controller.update();
      syncInstall('plan');
      return;
    }
    clearController();
    controller = mountPlan(next);
    if (!controller) go(`#/p/${next.projectId}`);
    syncInstall('plan');
    return;
  }
  clearController();
  if (next.name === 'list') {
    if (!renderList(next.projectId, next.plotId)) go(`#/p/${next.projectId}`);
    syncInstall('list');
    return;
  }
  if (next.name === 'project') {
    if (!renderProject(next.projectId)) go('#/');
    syncInstall('project');
    return;
  }
  renderHome();
  syncInstall('home');
}

function stamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function shareBackup(projectId) {
  const project = projectId ? getProject(projectId) : null;
  showBusy('Preparing the backup…');
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    const data = await makeBackup(projectId ? { projectId } : {});
    hideBusy();
    const name = `Orb-Survey-${slug(project?.name || 'phone')}-${stamp()}.orbsurvey`;
    const result = await shareFiles([{
      data,
      name,
      type: 'application/octet-stream',
    }], 'Orb Survey backup');
    if (result === 'downloaded') showToast('Backup saved. Keep that file somewhere safe.');
  } catch (error) {
    console.error(error);
    hideBusy();
    showToast('Could not make the backup.');
  }
}

async function exportPdf(projectId, plotId) {
  const project = getProject(projectId);
  if (!project) return;
  const plots = plotId ? plotsFor(projectId).filter((plot) => plot.id === plotId) : plotsFor(projectId);
  if (!plots.length) {
    showToast('Add a plan first.');
    return;
  }
  showBusy('Making the PDF…');
  try {
    const bytes = await buildSurveyPdf({
      project,
      plots,
      entries: plots.flatMap((plot) => entriesFor(plot.id)),
      getBlob: (id) => import('./store.js').then((mod) => mod.getBlob(id)),
      onProgress: setBusy,
    });
    hideBusy();
    const name = plotId
      ? `${slug(project.name)}-${slug(plots[0].name)}.pdf`
      : `${slug(project.name)}-survey.pdf`;
    const result = await shareFiles([{ data: bytes, name, type: 'application/pdf' }], name);
    if (result === 'downloaded') showToast('PDF saved to downloads.');
  } catch (error) {
    console.error(error);
    hideBusy();
    showToast('Could not make the PDF.');
  }
}

async function exportCsv(projectId, plotId) {
  const project = getProject(projectId);
  if (!project) return;
  const plots = plotId ? plotsFor(projectId).filter((plot) => plot.id === plotId) : plotsFor(projectId);
  const csv = toCsv(buildRows({
    project,
    plots,
    entries: plots.flatMap((plot) => entriesFor(plot.id)),
  }));
  const name = plotId
    ? `${slug(project.name)}-${slug(plots[0].name)}.csv`
    : `${slug(project.name)}-survey.csv`;
  const result = await shareFiles([{
    data: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    name,
    type: 'text/csv',
  }], name);
  if (result === 'downloaded') showToast('Spreadsheet saved to downloads.');
}

async function importFiles(fileList) {
  const files = [...fileList];
  if (!files.length || !importProjectId) return;
  const project = getProject(importProjectId);
  showBusy(`Adding plan 1 of ${files.length}`);
  const failures = [];
  const detected = new Set();
  let added = 0;
  try {
    for (let index = 0; index < files.length; index += 1) {
      setBusy(`Adding plan ${index + 1} of ${files.length}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const file = files[index];
      try {
        const info = await inspectPdf(file);
        const merged = mergeWinner(info.texts);
        if (merged.projectName) detected.add(merged.projectName);
        const pages = labelPages(info.texts);
        if (!pages.length) {
          for (let page = 1; page <= info.pageCount; page += 1) {
            pages.push({ index: page, kind: 'other', label: `Page ${page}` });
          }
        }
        await addPlot({
          projectId: importProjectId,
          name: uniquePlotName(importProjectId, merged.designName || nameFromFilename(file.name)),
          projectNumber: merged.projectNumber || '',
          pages,
          activePage: defaultPage(pages),
          pdfBlob: file,
        });
        added += 1;
      } catch (error) {
        console.error(error);
        failures.push(file.name);
      }
    }
  } finally {
    hideBusy();
  }
  if (project && detected.size === 1) {
    const name = [...detected][0];
    if (name && name.toLowerCase() !== project.name.toLowerCase()) {
      showToast(`Plans say “${name}”. They were added to ${project.name}.`);
      return;
    }
  }
  if (failures.length) showToast(`Added ${added}. Could not read ${failures.length} file${failures.length === 1 ? '' : 's'}.`);
  else if (added) showToast(`Added ${added} plan${added === 1 ? '' : 's'}.`);
}

async function onRestoreFile(file) {
  if (!file) return;
  const ok = await confirmDialog({
    title: 'Restore backup?',
    body: 'This adds the backup onto this phone. Plans already here are kept. Matching items are updated.',
    confirmLabel: 'Restore',
    danger: false,
  });
  if (!ok) return;
  showBusy('Restoring…');
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    await restoreBackup(await file.arrayBuffer());
    const settings = loadSettings();
    disto.offsetMm = Number(settings.offsetMm) || 0;
    hideBusy();
    showToast('Backup restored.');
    render({ fromHash: true });
  } catch (error) {
    console.error(error);
    hideBusy();
    showToast(error.message || 'Could not restore that file.');
  }
}

async function handle(action, button) {
  if (controller?.handle?.(action, button)) return;
  if (action === 'nav') {
    location.hash = button.dataset.href;
    return;
  }
  if (action === 'new-project') {
    const name = await promptDialog({
      title: 'New project',
      label: 'Site name',
      placeholder: 'Crofts Bank Road',
      confirmLabel: 'Create',
    });
    if (!name?.trim()) return;
    const project = await createProject(name);
    location.hash = `#/p/${project.id}`;
    return;
  }
  if (action === 'rename-project' && route.projectId) {
    const project = getProject(route.projectId);
    const name = await promptDialog({
      title: 'Rename project',
      label: 'Site name',
      value: project?.name || '',
      confirmLabel: 'Save',
    });
    if (name?.trim()) await renameProject(route.projectId, name);
    return;
  }
  if (action === 'delete-project' && route.projectId) {
    const project = getProject(route.projectId);
    const ok = await confirmDialog({
      title: 'Delete project?',
      body: `${project?.name || 'This project'} and every plot on this phone will be removed.`,
    });
    if (!ok) return;
    await deleteProject(route.projectId);
    location.hash = '#/';
    return;
  }
  if (action === 'add-plans') {
    importProjectId = route.projectId;
    document.getElementById('pdf-input').click();
    return;
  }
  if (action === 'set-status') {
    await setPlotStatus(button.dataset.id, button.dataset.status);
    return;
  }
  if (action === 'export-pdf') {
    await exportPdf(route.projectId, null);
    return;
  }
  if (action === 'export-csv') {
    await exportCsv(route.projectId, null);
    return;
  }
  if (action === 'backup-all') {
    await shareBackup(null);
    return;
  }
  if (action === 'backup-project') {
    await shareBackup(route.projectId);
    return;
  }
  if (action === 'restore') {
    document.getElementById('restore-input').click();
    return;
  }
  if (action === 'help') {
    const erase = await helpDialog();
    if (erase !== 'erase') return;
    const ok = await confirmDialog({
      title: 'Erase everything?',
      body: 'All projects, plans, photos, and measurements on this phone will be deleted.',
    });
    if (!ok) return;
    await eraseEverything();
    saveSettings({ offsetMm: 0 });
    disto.offsetMm = 0;
    location.hash = '#/';
    showToast('This phone is clear.');
    return;
  }
  if (action === 'delete-plot' && route.plotId) {
    const plot = getPlot(route.plotId);
    const ok = await confirmDialog({
      title: 'Remove this plot?',
      body: `${plot?.name || 'This plot'} and its measurements will be deleted from this phone.`,
    });
    if (!ok) return;
    const projectId = route.projectId;
    await deletePlot(route.plotId);
    location.hash = `#/p/${projectId}`;
    return;
  }
  if (action === 'share-menu' && route.projectId) {
    const choice = await chooseDialog({
      title: 'Share',
      options: [
        ...(route.plotId ? [
          { id: 'rename', label: 'Rename this plot' },
          { id: 'plot-pdf', label: 'This plot — PDF' },
          { id: 'plot-csv', label: 'This plot — spreadsheet' },
        ] : []),
        { id: 'all-pdf', label: 'Whole project — PDF' },
        { id: 'all-csv', label: 'Whole project — spreadsheet' },
      ],
    });
    if (choice === 'rename' && route.plotId) {
      const plot = getPlot(route.plotId);
      const name = await promptDialog({
        title: 'Rename plot',
        label: 'Plot name',
        value: plot?.name || '',
        confirmLabel: 'Save',
      });
      if (name?.trim()) await renamePlot(route.plotId, name);
    } else if (choice === 'plot-pdf') await exportPdf(route.projectId, route.plotId);
    else if (choice === 'plot-csv') await exportCsv(route.projectId, route.plotId);
    else if (choice === 'all-pdf') await exportPdf(route.projectId, null);
    else if (choice === 'all-csv') await exportCsv(route.projectId, null);
    return;
  }
  if (action === 'open-entry') {
    openEditor(button.dataset.id);
    return;
  }
  if (action === 'close-editor') {
    closeEditor();
    if (route.name === 'plan') controller?.update?.();
    return;
  }
  if (action === 'delete-entry') {
    const ok = await confirmDialog({
      title: 'Delete this mark?',
      body: 'The measurement and its photo will be removed.',
    });
    if (ok) await removeOpenEntry();
    return;
  }
  if (action === 'pick-choice') {
    const { getEntry, updateEntry } = await import('./store.js');
    const { entrySummary } = await import('./kinds.js');
    const entry = getEntry((await import('./editor.js')).editorEntryId());
    if (!entry) return;
    await updateEntry(entry.id, { fields: { [button.dataset.key]: button.dataset.value } });
    for (const choice of button.parentElement.querySelectorAll('button')) {
      choice.classList.toggle('on', choice === button);
    }
    const summary = document.querySelector('#editor-sheet .sheet-head h2');
    if (summary) summary.textContent = entrySummary(getEntry(entry.id));
    return;
  }
  if (action === 'take-photo') {
    const input = document.getElementById('photo-input');
    input.setAttribute('capture', 'environment');
    input.click();
    return;
  }
  if (action === 'choose-photo') {
    const input = document.getElementById('photo-input');
    input.removeAttribute('capture');
    input.click();
    return;
  }
  if (action === 'remove-photo') {
    await removeEntryPhoto();
    return;
  }
  if (action === 'disto') {
    if (distoSheetOpen()) closeDistoSheet();
    else openDistoSheet();
    return;
  }
  if (action === 'close-disto') {
    closeDistoSheet();
    return;
  }
  if (action === 'connect-disto') {
    try {
      await requestDevice();
      openDistoSheet();
      showToast(`Connected${disto.deviceName ? ` to ${disto.deviceName}` : ''}.`);
    } catch (error) {
      if (error?.name === 'NotFoundError') return;
      showToast(error?.message || 'Could not connect. Switch the DISTO on and stand closer.');
      openDistoSheet();
    }
    return;
  }
  if (action === 'disconnect-disto') {
    disconnectDevice();
    openDistoSheet();
    return;
  }
  if (action === 'start-sim') {
    startSimulate();
    openDistoSheet();
    return;
  }
  if (action === 'stop-sim') {
    stopSimulate();
    openDistoSheet();
    return;
  }
  if (action === 'sim-measure') {
    simulateShot();
    return;
  }
  if (action === 'remote-measure') {
    try {
      await remoteMeasure();
      showToast('Measure sent. Wait for the laser.');
    } catch (error) {
      showToast(error?.message || 'Could not trigger the laser. Press the button on the DISTO.');
    }
    return;
  }
  if (action === 'use-reading') {
    applyReading(button.dataset.which || 'distance');
    return;
  }
  if (action === 'mark-a' || action === 'mark-b') {
    if (!rememberMark(action === 'mark-a' ? 'A' : 'B')) {
      showToast('That shot had no stand angles. Fit the DST 360-X and measure two points.');
    }
    return;
  }
  if (action === 'clear-span') {
    forgetSpan();
    return;
  }
  if (action === 'install' && deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    syncInstall(route.name);
    return;
  }
  if (action === 'hide-install') {
    sessionStorage.setItem('orb-install-hide', '1');
    syncInstall(route.name);
  }
}

export function startRouter() {
  disto.offsetMm = Number(loadSettings().offsetMm) || 0;
  window.addEventListener('hashchange', () => render({ fromHash: true }));
  subscribe(() => render({ fromHash: false }));
  document.body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    handle(button.dataset.action, button).catch((error) => {
      console.error(error);
      hideBusy();
      showToast('Something went wrong. The survey on this phone is unchanged.');
    });
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    syncInstall(route.name);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!document.getElementById('modal').hidden) return;
    if (distoSheetOpen()) closeDistoSheet();
    else closeEditor();
  });
  document.getElementById('pdf-input').addEventListener('change', (event) => {
    const { files } = event.target;
    event.target.value = '';
    importFiles(files);
  });
  document.getElementById('restore-input').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    onRestoreFile(file);
  });
  document.getElementById('photo-input').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) setEntryPhoto(file);
  });
  onDisto((event) => {
    refreshDistoPills();
    refreshDistoSheet();
    updateShotHint();
    if (event === 'shot') {
      applyReading('distance', { quiet: true });
      document.querySelector('.disto-pill')?.classList.add('flash');
      setTimeout(() => document.querySelector('.disto-pill')?.classList.remove('flash'), 700);
    }
  });
  render({ fromHash: false });
  refreshDistoPills();
}
