import { refreshDistoPills, topbar } from './chrome.js';
import { showToast } from './dialogs.js';
import { closeEditor, editorEntryId, openEditor } from './editor.js';
import { esc } from './format.js';
import { MOVE_TOOL, defaultFields, kindById, missingLabels, pinCaption, toolIcon, tools } from './kinds.js';
import { loadPdf, renderPage } from './pdf.js';
import { addEntry, deleteEntry, entriesFor, getBlob, getEntry, getPlot, setActivePage, updateEntry } from './store.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shiftGeom(geom, dx, dy) {
  const next = { ...geom };
  if (next.x2 != null) {
    const minX = Math.min(next.x1, next.x2);
    const maxX = Math.max(next.x1, next.x2);
    const minY = Math.min(next.y1, next.y2);
    const maxY = Math.max(next.y1, next.y2);
    const adjX = dx > 0 ? Math.min(dx, 1 - maxX) : Math.max(dx, -minX);
    const adjY = dy > 0 ? Math.min(dy, 1 - maxY) : Math.max(dy, -minY);
    next.x1 += adjX;
    next.x2 += adjX;
    next.y1 += adjY;
    next.y2 += adjY;
    return next;
  }
  next.x = clamp(next.x + dx, 0, 1);
  next.y = clamp(next.y + dy, 0, 1);
  return next;
}

export function mountPlan({ projectId, plotId }) {
  const plot = getPlot(plotId);
  if (!plot) return null;
  const app = document.getElementById('app');
  let tool = 'move';
  let currentPage = plot.activePage || 1;
  let pdfDoc = null;
  let destroyed = false;
  let renderToken = 0;
  let pageW = 842;
  let pageH = 595;
  const view = { x: 0, y: 0, scale: 1 };
  const pointers = new Map();
  let pinch = null;
  let gesture = null;
  let anchor = null;

  app.innerHTML = `<div class="screen plan-screen">
    ${topbar({
      back: `#/p/${projectId}`,
      title: plot.name,
      right: `<button type="button" class="text-btn" data-action="nav" data-href="#/p/${projectId}/plot/${plotId}/list">List <span class="list-badge" hidden>0</span></button><button type="button" class="text-btn" data-action="share-menu">Share</button>`,
    })}
    <div class="pages"></div>
    <div class="plan-view">
      <div class="stage">
        <canvas></canvas>
        <svg class="marks"></svg>
        <div class="pins"></div>
        <svg class="preview"></svg>
      </div>
      <p class="plan-message">Opening plan…</p>
      <div class="zoom">
        <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" data-action="zoom-fit" aria-label="Fit plan">Fit</button>
      </div>
    </div>
    <div class="toolbar">
      <p class="hintline"></p>
      <div class="tools">
        ${tools().map((item) => `<button type="button" class="tool${item.id === 'move' ? ' on' : ''}" data-action="tool" data-tool="${item.id}">${toolIcon(item.id)}<span>${esc(item.label)}</span></button>`).join('')}
      </div>
    </div>
  </div>`;
  refreshDistoPills();

  const viewport = app.querySelector('.plan-view');
  const stage = app.querySelector('.stage');
  const canvas = app.querySelector('canvas');
  const message = app.querySelector('.plan-message');
  const pagesEl = app.querySelector('.pages');

  function modeOf(id) {
    return id === 'move' ? 'move' : kindById(id).mode;
  }

  function applyTransform() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  }

  function fit() {
    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !pageW) return;
    const scale = Math.min(rect.width / pageW, rect.height / pageH) * 0.96;
    view.scale = scale;
    view.x = (rect.width - pageW * scale) / 2;
    view.y = (rect.height - pageH * scale) / 2;
    applyTransform();
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const worldX = (cx - view.x) / view.scale;
    const worldY = (cy - view.y) / view.scale;
    view.scale = clamp(view.scale * factor, 0.2, 8);
    view.x = cx - worldX * view.scale;
    view.y = cy - worldY * view.scale;
    applyTransform();
  }

  function sizeOverlays() {
    stage.style.width = `${pageW}px`;
    stage.style.height = `${pageH}px`;
    for (const svg of stage.querySelectorAll('svg')) {
      svg.setAttribute('viewBox', `0 0 ${pageW} ${pageH}`);
    }
  }

  function clientToFrac(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function setPreview(kind, a, b) {
    const svg = stage.querySelector('.preview');
    if (!kind || !a || !b) {
      svg.innerHTML = '';
      return;
    }
    const x1 = a.x * pageW;
    const y1 = a.y * pageH;
    const x2 = b.x * pageW;
    const y2 = b.y * pageH;
    if (kind === 'line') {
      svg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
      return;
    }
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    svg.innerHTML = `<rect x="${x}" y="${y}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" />`;
  }

  function showAnchor(frac) {
    const svg = stage.querySelector('.preview');
    if (!frac) {
      svg.innerHTML = '';
      return;
    }
    svg.innerHTML = `<circle cx="${frac.x * pageW}" cy="${frac.y * pageH}" r="10" />`;
  }

  function updateOverlay() {
    const svg = stage.querySelector('.marks');
    const pins = stage.querySelector('.pins');
    const marks = entriesFor(plotId).filter((entry) => entry.page === currentPage);
    const lines = [];
    const pinHtml = [];
    for (const entry of marks) {
      const color = kindById(entry.kind).color;
      const geom = entry.geom || {};
      const caption = esc(pinCaption(entry));
      if (geom.x2 != null) {
        const x1 = geom.x1 * pageW;
        const y1 = geom.y1 * pageH;
        const x2 = geom.x2 * pageW;
        const y2 = geom.y2 * pageH;
        lines.push(`<line class="hit" data-mark="${entry.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`);
        lines.push(`<line class="vis" stroke="${color}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`);
        pinHtml.push(`<button type="button" class="linelabel" data-mark="${entry.id}" style="left:${((geom.x1 + geom.x2) / 2) * 100}%;top:${((geom.y1 + geom.y2) / 2) * 100}%">${caption}</button>`);
      } else if (geom.w != null) {
        lines.push(`<rect class="zone" data-mark="${entry.id}" stroke="${color}" fill="${color}" x="${geom.x * pageW}" y="${geom.y * pageH}" width="${geom.w * pageW}" height="${geom.h * pageH}" />`);
        pinHtml.push(`<button type="button" class="linelabel" data-mark="${entry.id}" style="left:${(geom.x + geom.w / 2) * 100}%;top:${(geom.y + geom.h / 2) * 100}%">${caption}</button>`);
      } else if (geom.x != null) {
        const open = editorEntryId() === entry.id ? ' open' : '';
        pinHtml.push(`<button type="button" class="pin${open}" data-mark="${entry.id}" style="left:${geom.x * 100}%;top:${geom.y * 100}%"><span class="pin-num" style="background:${color}">${entry.num}</span><span class="pin-label">${caption}</span></button>`);
      }
    }
    svg.innerHTML = lines.join('');
    pins.innerHTML = pinHtml.join('');
  }

  function updateChrome() {
    const current = getPlot(plotId);
    if (!current) return;
    const title = app.querySelector('.title-text');
    if (title) title.textContent = current.name;
    const missing = entriesFor(plotId).filter((entry) => missingLabels(entry).length).length;
    const badge = app.querySelector('.list-badge');
    if (badge) {
      badge.hidden = missing === 0;
      badge.textContent = String(missing);
    }
    for (const button of pagesEl.querySelectorAll('button')) {
      button.classList.toggle('on', Number(button.dataset.page) === currentPage);
    }
    const active = pagesEl.querySelector('button.on');
    active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function renderPageChips() {
    const current = getPlot(plotId);
    const pages = current?.pages?.length
      ? current.pages
      : [{ index: currentPage, label: `Page ${currentPage}` }];
    pagesEl.innerHTML = pages.map((page) => `<button type="button" data-action="set-page" data-page="${page.index}" class="${page.index === currentPage ? 'on' : ''}">${esc(page.label)}</button>`).join('');
  }

  function setTool(id) {
    tool = id;
    anchor = null;
    setPreview(null);
    for (const button of app.querySelectorAll('.tool')) {
      button.classList.toggle('on', button.dataset.tool === id);
    }
    const hint = id === 'move' ? MOVE_TOOL.hint : kindById(id).hint;
    app.querySelector('.hintline').textContent = hint;
  }

  async function place(kindId, geom) {
    const entry = await addEntry({
      plotId,
      page: currentPage,
      kind: kindId,
      geom,
      fields: defaultFields(kindId),
    });
    openEditor(entry.id);
    showToast(`${kindById(kindId).label} added`, {
      label: 'Undo',
      run: () => {
        if (editorEntryId() === entry.id) closeEditor();
        deleteEntry(entry.id);
      },
    });
    navigator.vibrate?.(10);
  }

  function hitMark(x, y) {
    const el = document.elementFromPoint(x, y);
    const mark = el?.closest?.('[data-mark]');
    if (!mark || !viewport.contains(mark)) return null;
    return mark.dataset.mark;
  }

  async function loadPage(number) {
    const token = ++renderToken;
    message.hidden = false;
    message.textContent = 'Opening plan…';
    try {
      if (!pdfDoc) {
        const blob = await getBlob(`pdf:${plotId}`);
        if (!blob) {
          message.textContent = 'The plan file is missing on this phone.';
          return;
        }
        pdfDoc = await loadPdf(blob);
      }
      if (token !== renderToken || destroyed) return;
      const total = pdfDoc.numPages;
      const safe = clamp(number, 1, total);
      currentPage = safe;
      const size = await renderPage(pdfDoc, safe, canvas);
      if (token !== renderToken || destroyed) return;
      pageW = size.cssWidth;
      pageH = size.cssHeight;
      sizeOverlays();
      message.hidden = true;
      updateOverlay();
      updateChrome();
      fit();
    } catch (error) {
      console.error(error);
      if (token !== renderToken || destroyed) return;
      message.hidden = false;
      message.textContent = 'Could not open this page of the plan.';
    }
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('.zoom')) return;
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const rect = viewport.getBoundingClientRect();
      pinch = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        scale: view.scale,
        worldX: (mid.x - rect.left - view.x) / view.scale,
        worldY: (mid.y - rect.top - view.y) / view.scale,
      };
      gesture = null;
      anchor = null;
      setPreview(null);
      return;
    }
    gesture = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      hit: hitMark(event.clientX, event.clientY),
      start: clientToFrac(event.clientX, event.clientY),
    };
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinch) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const rect = viewport.getBoundingClientRect();
      const scale = clamp(pinch.scale * (dist / pinch.dist), 0.2, 8);
      view.scale = scale;
      view.x = mid.x - rect.left - pinch.worldX * scale;
      view.y = mid.y - rect.top - pinch.worldY * scale;
      applyTransform();
      return;
    }
    if (!gesture) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 8) return;
    gesture.moved = true;
    const mode = modeOf(tool);
    if (gesture.hit && tool === 'move') {
      const rect = stage.getBoundingClientRect();
      const entry = getEntry(gesture.hit);
      if (entry && rect.width && rect.height) {
        entry.geom = shiftGeom(
          entry.geom,
          (event.clientX - gesture.lastX) / rect.width,
          (event.clientY - gesture.lastY) / rect.height,
        );
        updateOverlay();
      }
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      return;
    }
    if ((mode === 'line' || mode === 'rect') && !gesture.hit) {
      setPreview(mode === 'line' ? 'line' : 'rect', gesture.start, clientToFrac(event.clientX, event.clientY));
      return;
    }
    view.x += event.clientX - gesture.lastX;
    view.y += event.clientY - gesture.lastY;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    applyTransform();
  }

  function screenDistance(a, b) {
    return Math.hypot((a.x - b.x) * pageW, (a.y - b.y) * pageH) * view.scale;
  }

  async function onPointerUp(event) {
    const known = pointers.has(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!known || pointers.size > 0) {
      if (pointers.size === 0) gesture = null;
      return;
    }
    const current = gesture;
    gesture = null;
    if (!current) return;
    const mode = modeOf(tool);
    const end = clientToFrac(event.clientX, event.clientY);
    if (current.moved && current.hit && tool === 'move') {
      const entry = getEntry(current.hit);
      if (entry) await updateEntry(entry.id, { geom: entry.geom });
      return;
    }
    if (!current.moved && current.hit) {
      openEditor(current.hit);
      return;
    }
    if (mode === 'pin' && !current.moved && !current.hit) {
      await place(tool, { x: end.x, y: end.y });
      return;
    }
    if ((mode === 'line' || mode === 'rect') && current.moved && !current.hit) {
      setPreview(null);
      if (screenDistance(current.start, end) < 16) {
        if (mode === 'rect') showToast('Drag across the lowered area.');
        return;
      }
      if (mode === 'line') {
        await place('wall', { x1: current.start.x, y1: current.start.y, x2: end.x, y2: end.y });
      } else {
        await place(tool, {
          x: Math.min(current.start.x, end.x),
          y: Math.min(current.start.y, end.y),
          w: Math.abs(end.x - current.start.x),
          h: Math.abs(end.y - current.start.y),
        });
      }
      anchor = null;
      return;
    }
    if (mode === 'line' && !current.moved && !current.hit) {
      if (!anchor) {
        anchor = end;
        showAnchor(anchor);
        return;
      }
      const start = anchor;
      anchor = null;
      setPreview(null);
      if (screenDistance(start, end) < 12) return;
      await place('wall', { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    }
  }

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerUp);
  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
  }, { passive: false });
  viewport.addEventListener('contextmenu', (event) => event.preventDefault());

  let lastWidth = window.innerWidth;
  const onResize = () => {
    if (Math.abs(window.innerWidth - lastWidth) > 80) {
      lastWidth = window.innerWidth;
      fit();
    }
  };
  window.addEventListener('resize', onResize);

  setTool('move');
  renderPageChips();
  loadPage(currentPage);

  return {
    key: `plan:${projectId}:${plotId}`,
    update() {
      if (destroyed) return;
      updateChrome();
      updateOverlay();
      refreshDistoPills();
    },
    destroy() {
      destroyed = true;
      window.removeEventListener('resize', onResize);
      pdfDoc?.destroy?.();
      pdfDoc = null;
    },
    handle(action, button) {
      if (action === 'tool') {
        setTool(button.dataset.tool);
        return true;
      }
      if (action === 'set-page') {
        const next = Number(button.dataset.page);
        if (next === currentPage) return true;
        currentPage = next;
        anchor = null;
        setPreview(null);
        updateChrome();
        setActivePage(plotId, next);
        loadPage(next);
        return true;
      }
      if (action === 'zoom-in') {
        const rect = viewport.getBoundingClientRect();
        zoomAt(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
        return true;
      }
      if (action === 'zoom-out') {
        const rect = viewport.getBoundingClientRect();
        zoomAt(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
        return true;
      }
      if (action === 'zoom-fit') {
        fit();
        return true;
      }
      return false;
    },
  };
}
