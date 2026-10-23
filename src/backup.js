import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { getBlob, putBlob, replaceFromBackup, snapshot } from './store.js';
import { loadSettings, saveSettings } from './settings.js';

export async function makeBackup({ projectId } = {}) {
  const snap = snapshot();
  let { projects, plots, entries } = snap;
  if (projectId) {
    projects = projects.filter((project) => project.id === projectId);
    const ids = new Set(plots.filter((plot) => plot.projectId === projectId).map((plot) => plot.id));
    plots = plots.filter((plot) => ids.has(plot.id));
    entries = entries.filter((entry) => ids.has(entry.plotId));
  }
  const files = {
    'manifest.json': strToU8(JSON.stringify({
      format: 'orb-survey-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: loadSettings(),
      projects,
      plots,
      entries,
    })),
  };
  for (const plot of plots) {
    const blob = await getBlob(`pdf:${plot.id}`);
    if (blob) files[`pdf/${plot.id}.pdf`] = new Uint8Array(await blob.arrayBuffer());
  }
  for (const entry of entries) {
    if (!entry.photoId) continue;
    const blob = await getBlob(`photo:${entry.photoId}`);
    if (blob) files[`photo/${entry.photoId}.jpg`] = new Uint8Array(await blob.arrayBuffer());
  }
  return zipSync(files, { level: 6 });
}

export async function restoreBackup(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const raw = files['manifest.json'];
  if (!raw) throw new Error('This file is not an Orb Survey backup.');
  const manifest = JSON.parse(strFromU8(raw));
  if (manifest.format !== 'orb-survey-backup' || manifest.version !== 1) {
    throw new Error('This backup is from a different version of Orb Survey.');
  }
  await replaceFromBackup(manifest);
  if (manifest.settings) saveSettings({ ...loadSettings(), ...manifest.settings });
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith('pdf/') && name.endsWith('.pdf')) {
      const id = name.slice(4, -4);
      await putBlob(`pdf:${id}`, new Blob([data], { type: 'application/pdf' }));
    } else if (name.startsWith('photo/')) {
      const id = name.slice('photo/'.length).replace(/\.jpg$/i, '');
      await putBlob(`photo:${id}`, new Blob([data], { type: 'image/jpeg' }));
    }
  }
}
