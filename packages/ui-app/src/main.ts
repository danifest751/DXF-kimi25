/**
 * @module main
 * Точка входа приложения DXF Viewer.
 * Мультифайловая архитектура: загрузка нескольких DXF,
 * чекбоксы для включения в расчёт резки.
 */

import './styles/base.css';
import './styles/toolbar.css';
import './styles/sidebar.css';
import './styles/canvas.css';
import './styles/nesting.css';
import './styles/statusbar.css';
import './styles/animations.css';
import './styles/responsive.css';

import { DXFRenderer } from '../../core-engine/src/render/renderer.js';
import { renderEntity } from '../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../core-engine/src/render/entity-renderer.js';
import { parseDXFInWorker } from '../../core-engine/src/workers/index.js';
import { computeCuttingStats, formatCutLength } from '../../core-engine/src/cutting/index.js';
import { nestItems, SHEET_PRESETS } from '../../core-engine/src/nesting/index.js';
import type { NestingResult, NestingOptions } from '../../core-engine/src/nesting/index.js';
import type { NormalizedDocument, FlattenedEntity } from '../../core-engine/src/normalize/index.js';
import type { Color, Point3D } from '../../core-engine/src/types/index.js';

// ─── Типы ───────────────────────────────────────────────────────────

interface LoadedFile {
  id: number;
  name: string;
  doc: NormalizedDocument;
  stats: UICuttingStats;
  checked: boolean;
  quantity: number;
}

interface UICuttingChain {
  readonly piercePoint: Point3D;
}

interface UICuttingStats {
  readonly totalPierces: number;
  readonly totalCutLength: number;
  readonly cuttingEntityCount: number;
  readonly chains: readonly UICuttingChain[];
}

type ComputeMode = 'api' | 'local';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function apiPostJSON<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function apiPostBlob(path: string, payload: unknown): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.blob();
}

// ─── DOM элементы ───────────────────────────────────────────────────

const canvas = document.getElementById('dxf-canvas') as HTMLCanvasElement;
const container = document.getElementById('canvas-container') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const btnWelcomeOpen = document.getElementById('btn-welcome-open') as HTMLButtonElement;
const btnFit = document.getElementById('btn-fit') as HTMLButtonElement;
const btnAddFiles = document.getElementById('btn-add-files') as HTMLButtonElement;
const btnInspector = document.getElementById('btn-inspector') as HTMLButtonElement;
const btnGrid = document.getElementById('btn-grid') as HTMLButtonElement;
const welcome = document.getElementById('welcome') as HTMLDivElement;
const dropOverlay = document.getElementById('drop-overlay') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressLabel = document.getElementById('progress-label') as HTMLSpanElement;
const statsEl = document.getElementById('stats') as HTMLSpanElement;
const fileListEl = document.getElementById('file-list') as HTMLDivElement;
const fileListEmpty = document.getElementById('file-list-empty') as HTMLDivElement;
const sidebarInspector = document.getElementById('sidebar-inspector') as HTMLDivElement;
const inspectorContent = document.getElementById('inspector-content') as HTMLDivElement;
const statusCoords = document.getElementById('status-coords') as HTMLSpanElement;
const statusZoom = document.getElementById('status-zoom') as HTMLSpanElement;
const statusEntities = document.getElementById('status-entities') as HTMLSpanElement;
const statusVersion = document.getElementById('status-version') as HTMLSpanElement;
const statusPierces = document.getElementById('status-pierces') as HTMLSpanElement;
const statusCutLength = document.getElementById('status-cutlength') as HTMLSpanElement;
const chkPierces = document.getElementById('chk-pierces') as HTMLInputElement;
const cuttingInfo = document.getElementById('cutting-info') as HTMLDivElement;
const ciPierces = document.getElementById('ci-pierces') as HTMLElement;
const ciLength = document.getElementById('ci-length') as HTMLElement;
const pierceToggle = document.getElementById('pierce-toggle') as HTMLLabelElement;

// Nesting DOM
const btnNesting = document.getElementById('btn-nesting') as HTMLButtonElement;
const nestingPanel = document.getElementById('nesting-panel') as HTMLDivElement;
const nestPreset = document.getElementById('nest-preset') as HTMLSelectElement;
const nestCustomRow = document.getElementById('nest-custom-row') as HTMLDivElement;
const nestW = document.getElementById('nest-w') as HTMLInputElement;
const nestH = document.getElementById('nest-h') as HTMLInputElement;
const nestGap = document.getElementById('nest-gap') as HTMLInputElement;
const nestRotateEnabled = document.getElementById('nest-rotate-enabled') as HTMLInputElement;
const nestRotateStep = document.getElementById('nest-rotate-step') as HTMLSelectElement;
const nestMode = document.getElementById('nest-mode') as HTMLSelectElement;
const nestStrategy = document.getElementById('nest-strategy') as HTMLSelectElement;
const nestMultiStart = document.getElementById('nest-multistart') as HTMLInputElement;
const nestSeed = document.getElementById('nest-seed') as HTMLInputElement;
const nestCommonLineEnabled = document.getElementById('nest-commonline-enabled') as HTMLInputElement;
const nestCommonLineStatus = document.getElementById('nest-commonline-status') as HTMLDivElement;
const nestCommonLineDist = document.getElementById('nest-commonline-dist') as HTMLInputElement;
const nestCommonLineMinLen = document.getElementById('nest-commonline-minlen') as HTMLInputElement;
const nestItemsEl = document.getElementById('nest-items') as HTMLDivElement;
const nestItemsEmpty = document.getElementById('nest-items-empty') as HTMLDivElement;
const btnNestRun = document.getElementById('btn-nest-run') as HTMLButtonElement;
const nestResults = document.getElementById('nest-results') as HTMLDivElement;
const nestResultCards = document.getElementById('nest-result-cards') as HTMLDivElement;
const nestResultSummary = document.getElementById('nest-result-summary') as HTMLDivElement;
const btnExportDXF = document.getElementById('btn-export-dxf') as HTMLButtonElement;
const btnExportCSV = document.getElementById('btn-export-csv') as HTMLButtonElement;
const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
const nestingScroll = document.getElementById('nesting-scroll') as HTMLDivElement;
const nestingCanvas = document.getElementById('nesting-canvas') as HTMLCanvasElement;
const nestClose = document.getElementById('nest-close') as HTMLButtonElement;
const nestZoomPopup = document.getElementById('nest-zoom-popup') as HTMLDivElement;
const nestZoomCanvas = document.getElementById('nest-zoom-canvas') as HTMLCanvasElement;
const nestZoomLabel = document.getElementById('nest-zoom-label') as HTMLDivElement;
const mobileBackdrop = document.getElementById('mobile-backdrop') as HTMLDivElement;
const sidebarFiles = document.getElementById('sidebar-files') as HTMLDivElement;

// ─── Состояние ──────────────────────────────────────────────────────

const renderer = new DXFRenderer();
renderer.attach(canvas);

let showGrid = false;
let nextFileId = 1;
const loadedFiles: LoadedFile[] = [];
let activeFileId: number = -1;
let nestingMode = false;
let currentNestResult: NestingResult | null = null;
let lastNestingOptions: NestingOptions | null = null;
let nestCellRects: { x: number; y: number; w: number; h: number; si: number }[] = [];
let nestHoveredSheet = -1;
let cuttingComputeMode: ComputeMode = 'api';
let nestingComputeMode: ComputeMode = 'api';

const modeBadge = document.createElement('div');
modeBadge.style.position = 'fixed';
modeBadge.style.right = '12px';
modeBadge.style.bottom = '12px';
modeBadge.style.padding = '6px 10px';
modeBadge.style.borderRadius = '8px';
modeBadge.style.font = '500 11px/1.2 system-ui, sans-serif';
modeBadge.style.color = '#e5e7eb';
modeBadge.style.background = 'rgba(17, 24, 39, 0.85)';
modeBadge.style.border = '1px solid rgba(229, 231, 235, 0.2)';
modeBadge.style.backdropFilter = 'blur(4px)';
modeBadge.style.zIndex = '9999';

function updateModeBadge(): void {
  modeBadge.textContent = `Mode: cutting ${cuttingComputeMode.toUpperCase()} | nesting ${nestingComputeMode.toUpperCase()}`;
}

updateModeBadge();
document.body.appendChild(modeBadge);

// ─── Загрузка файлов ────────────────────────────────────────────────

function openFileDialog(): void {
  fileInput.click();
}

fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  if (files && files.length > 0) {
    addFiles(Array.from(files));
  }
  fileInput.value = '';
});

async function addFiles(files: File[]): Promise<void> {
  welcome.classList.add('hidden');

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.dxf')) continue;
    await loadSingleFile(file);
  }
}

async function loadSingleFile(file: File): Promise<void> {
  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressLabel.textContent = `Загрузка: ${file.name}`;

  try {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const result = await parseDXFInWorker(buffer, {
      onProgress(p) {
        const pct = p.totalBytes > 0 ? (p.bytesProcessed / p.totalBytes) * 100 : 0;
        progressFill.style.width = `${Math.min(pct, 95)}%`;
      },
    });

    progressFill.style.width = '100%';
    setTimeout(() => progressBar.classList.add('hidden'), 400);

    let stats: UICuttingStats;
    try {
      const cuttingRes = await apiPostJSON<{ success: boolean; data: UICuttingStats }>('/api/cutting-stats', {
        base64,
      });
      stats = cuttingRes.data;
      cuttingComputeMode = 'api';
      updateModeBadge();
    } catch {
      const localStats = computeCuttingStats(result.document);
      stats = {
        totalPierces: localStats.totalPierces,
        totalCutLength: localStats.totalCutLength,
        cuttingEntityCount: localStats.cuttingEntityCount,
        chains: localStats.chains,
      };
      cuttingComputeMode = 'local';
      updateModeBadge();
    }

    const entry: LoadedFile = {
      id: nextFileId++,
      name: file.name,
      doc: result.document,
      stats,
      checked: true,
      quantity: 1,
    };
    loadedFiles.push(entry);

    setActiveFile(entry.id);
    renderFileList();
    recalcTotals();
  } catch (err) {
    progressBar.classList.add('hidden');
    const msg = err instanceof Error ? err.message : String(err);
    alert(`Ошибка загрузки ${file.name}: ${msg}`);
  }
}

function removeFile(id: number): void {
  const idx = loadedFiles.findIndex(f => f.id === id);
  if (idx < 0) return;
  loadedFiles.splice(idx, 1);

  if (loadedFiles.length === 0) {
    activeFileId = -1;
    renderer.clearDocument();
    statusEntities.textContent = '';
    statusVersion.textContent = '';
    welcome.classList.remove('hidden');
  } else if (activeFileId === id) {
    setActiveFile(loadedFiles[Math.min(idx, loadedFiles.length - 1)]!.id);
  }
  renderFileList();
  recalcTotals();
}

function setActiveFile(id: number): void {
  activeFileId = id;
  const entry = loadedFiles.find(f => f.id === id);
  if (!entry) return;

  renderer.setDocument(entry.doc);
  updateStatusBar();
  statusEntities.textContent = `${entry.doc.entityCount} obj`;
  statusVersion.textContent = entry.doc.source.metadata.version;
  renderFileList();
}

function toggleFileChecked(id: number): void {
  const entry = loadedFiles.find(f => f.id === id);
  if (!entry) return;
  entry.checked = !entry.checked;
  renderFileList();
  recalcTotals();
}

// ─── Пересчёт суммарной статистики ─────────────────────────────────

function recalcTotals(): void {
  let totalPierces = 0;
  let totalCutLength = 0;
  let totalEntities = 0;
  const allPiercePoints: Point3D[] = [];

  for (const f of loadedFiles) {
    if (!f.checked) continue;
    totalPierces += f.stats.totalPierces;
    totalCutLength += f.stats.totalCutLength;
    totalEntities += f.stats.cuttingEntityCount;
    for (const chain of f.stats.chains) {
      allPiercePoints.push(chain.piercePoint);
    }
  }

  const cutM = totalCutLength / 1000;

  ciPierces.textContent = String(totalPierces);
  ciLength.textContent = cutM >= 1 ? cutM.toFixed(2) + ' м' : totalCutLength.toFixed(1) + ' мм';
  cuttingInfo.classList.toggle('visible', loadedFiles.length > 0);

  statusPierces.textContent = totalPierces > 0 ? `Врезок: ${totalPierces}` : '';
  statusCutLength.textContent = totalCutLength > 0 ? `Рез: ${formatCutLength(totalCutLength)}` : '';

  const checkedCount = loadedFiles.filter(f => f.checked).length;
  statsEl.textContent = loadedFiles.length > 0
    ? `${checkedCount}/${loadedFiles.length} файлов`
    : '';

  renderer.setPiercePoints(allPiercePoints);
}

// ─── Рендеринг списка файлов ────────────────────────────────────────

function renderFileList(): void {
  fileListEmpty.style.display = loadedFiles.length === 0 ? '' : 'none';

  const existing = fileListEl.querySelectorAll('.file-item');
  existing.forEach(el => el.remove());

  for (const f of loadedFiles) {
    const cutLen = f.stats.totalCutLength;
    const lenStr = cutLen >= 1000
      ? (cutLen / 1000).toFixed(2) + 'м'
      : cutLen.toFixed(0) + 'мм';
    const info = `${f.stats.totalPierces}p · ${lenStr}`;

    const item = document.createElement('div');
    item.className = 'file-item' + (f.id === activeFileId ? ' active' : '');
    item.innerHTML = `
      <input type="checkbox" ${f.checked ? 'checked' : ''} />
      <svg class="file-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span class="file-item-name">${f.name}</span>
      <span class="file-item-info">${info}</span>
      <button class="file-item-remove" title="Удалить">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    const chk = item.querySelector('input') as HTMLInputElement;
    chk.addEventListener('click', (e) => { e.stopPropagation(); toggleFileChecked(f.id); });

    const removeBtn = item.querySelector('.file-item-remove') as HTMLButtonElement;
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFile(f.id); });

    item.addEventListener('click', () => setActiveFile(f.id));

    fileListEl.appendChild(item);
  }
}

// ─── Drag & Drop ────────────────────────────────────────────────────

container.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.classList.add('active'); });
container.addEventListener('dragleave', () => { dropOverlay.classList.remove('active'); });
container.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('active');
  if (e.dataTransfer?.files) {
    const dxfFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.dxf'));
    if (dxfFiles.length > 0) addFiles(dxfFiles);
  }
});

// ─── Навигация мышью ────────────────────────────────────────────────

let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * devicePixelRatio;
  const sy = (e.clientY - rect.top) * devicePixelRatio;
  renderer.camera.zoomAt(sx, sy, factor);
  renderer.requestRedraw();
  updateStatusBar();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvas.style.cursor = 'grabbing';
  } else if (e.button === 0) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * devicePixelRatio;
    const sy = (e.clientY - rect.top) * devicePixelRatio;
    const idx = renderer.hitTestScreen(sx, sy);
    renderer.clearSelection();
    if (idx >= 0) {
      const fe = renderer.getEntity(idx);
      if (fe) {
        renderer.select(fe.entity.handle);
        showInspector(fe);
      }
    } else {
      clearInspector();
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const dx = (e.clientX - lastMouseX) * devicePixelRatio;
    const dy = (e.clientY - lastMouseY) * devicePixelRatio;
    renderer.camera.panBy(dx, dy);
    renderer.requestRedraw();
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    updateStatusBar();
  }
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * devicePixelRatio;
  const sy = (e.clientY - rect.top) * devicePixelRatio;
  const world = renderer.camera.screenToWorld(sx, sy);
  statusCoords.textContent = `X: ${world.x.toFixed(2)}  Y: ${world.y.toFixed(2)}`;

  if (!isPanning) {
    const idx = renderer.hitTestScreen(sx, sy);
    renderer.setHovered(idx);
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
  }
});

window.addEventListener('mouseup', () => {
  isPanning = false;
  canvas.style.cursor = 'default';
});

// ─── Кнопки ─────────────────────────────────────────────────────────

btnOpen.addEventListener('click', openFileDialog);
btnWelcomeOpen.addEventListener('click', openFileDialog);
btnAddFiles.addEventListener('click', openFileDialog);
btnFit.addEventListener('click', () => { renderer.zoomToFit(); updateStatusBar(); });

btnInspector.addEventListener('click', () => {
  sidebarInspector.classList.toggle('hidden');
  renderer.resizeToContainer();
});

btnGrid.addEventListener('click', () => {
  showGrid = !showGrid;
  renderer.requestRedraw();
});

chkPierces.addEventListener('change', () => {
  renderer.showPiercePoints = chkPierces.checked;
  pierceToggle.classList.toggle('on', chkPierces.checked);
});

// ─── Resize ─────────────────────────────────────────────────────────

const resizeObserver = new ResizeObserver(() => { renderer.resizeToContainer(); });
resizeObserver.observe(container);

// ─── Инспектор ──────────────────────────────────────────────────────

function showInspector(fe: FlattenedEntity): void {
  sidebarInspector.classList.remove('hidden');
  const e = fe.entity;
  let html = '';
  const row = (label: string, value: string) => `<div class="prop-row"><span class="prop-label">${label}</span><span class="prop-value">${value}</span></div>`;

  html += row('Тип', e.type);
  html += row('Handle', e.handle);
  html += row('Слой', e.layer);
  html += row('Цвет', colorStr(fe.effectiveColor));
  html += row('Тип линии', fe.effectiveLineType);

  if ('start' in e && 'end' in e) {
    const s = e.start as { x: number; y: number; z: number };
    const en = e.end as { x: number; y: number; z: number };
    html += row('Начало', `${s.x.toFixed(2)}, ${s.y.toFixed(2)}`);
    html += row('Конец', `${en.x.toFixed(2)}, ${en.y.toFixed(2)}`);
  }
  if ('center' in e && 'radius' in e) {
    const c = e.center as { x: number; y: number; z: number };
    html += row('Центр', `${c.x.toFixed(2)}, ${c.y.toFixed(2)}`);
    html += row('Радиус', (e as { radius: number }).radius.toFixed(3));
  }

  inspectorContent.innerHTML = html;
  renderer.resizeToContainer();
}

function clearInspector(): void {
  inspectorContent.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">Кликните на объект</p>';
}

function colorStr(c: Color): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

// ─── Статусбар ──────────────────────────────────────────────────────

function updateStatusBar(): void {
  statusZoom.textContent = `${(renderer.camera.zoom * 100).toFixed(0)}%`;
}

// ─── Раскладка (Nesting) ────────────────────────────────────────────

btnNesting.addEventListener('click', () => {
  nestingPanel.classList.toggle('hidden');
  if (!nestingPanel.classList.contains('hidden')) {
    updateNestItems();
  }
  renderer.resizeToContainer();
});

nestPreset.addEventListener('change', () => {
  nestCustomRow.classList.toggle('hidden', nestPreset.value !== 'custom');
  if (nestPreset.value !== 'custom') {
    const p = SHEET_PRESETS[Number(nestPreset.value)]!;
    nestW.value = String(p.size.width);
    nestH.value = String(p.size.height);
  }
});

function updateRotationControls(): void {
  nestRotateStep.disabled = !nestRotateEnabled.checked;
  nestRotateStep.style.opacity = nestRotateEnabled.checked ? '1' : '0.5';
}

function updateCommonLineControls(): void {
  const enabled = nestCommonLineEnabled.checked;
  nestCommonLineDist.disabled = !enabled;
  nestCommonLineMinLen.disabled = !enabled;
  nestCommonLineDist.style.opacity = enabled ? '1' : '0.5';
  nestCommonLineMinLen.style.opacity = enabled ? '1' : '0.5';
  nestCommonLineStatus.textContent = enabled
    ? 'Status: ON (совместный рез включен)'
    : 'Status: OFF';
  nestCommonLineStatus.style.color = enabled ? '#10b981' : '#f59e0b';
}

let applyingModePreset = false;

function applyNestingModePreset(mode: 'fast' | 'precise' | 'common'): void {
  applyingModePreset = true;
  if (mode === 'fast') {
    nestStrategy.value = 'blf_bbox';
    nestMultiStart.checked = false;
    nestCommonLineEnabled.checked = false;
  } else if (mode === 'precise') {
    nestStrategy.value = 'maxrects_bbox';
    nestMultiStart.checked = true;
    nestCommonLineEnabled.checked = false;
  } else {
    nestStrategy.value = 'maxrects_bbox';
    nestMultiStart.checked = true;
    nestCommonLineEnabled.checked = true;
  }
  updateCommonLineControls();
  applyingModePreset = false;
}

function syncModeByAdvancedControls(): void {
  if (applyingModePreset) return;
  const strategy = nestStrategy.value;
  const multiStart = nestMultiStart.checked;
  const commonLine = nestCommonLineEnabled.checked;
  if (strategy === 'blf_bbox' && !multiStart && !commonLine) {
    nestMode.value = 'fast';
    return;
  }
  if (strategy === 'maxrects_bbox' && multiStart && !commonLine) {
    nestMode.value = 'precise';
    return;
  }
  if (strategy === 'maxrects_bbox' && multiStart && commonLine) {
    nestMode.value = 'common';
    return;
  }
  nestMode.value = strategy === 'blf_bbox' ? 'fast' : 'precise';
}

updateRotationControls();
applyNestingModePreset('precise');
updateCommonLineControls();

nestMode.addEventListener('change', () => {
  const mode = nestMode.value === 'fast' || nestMode.value === 'common' ? nestMode.value : 'precise';
  applyNestingModePreset(mode);
  autoRerunNesting();
});

nestRotateEnabled.addEventListener('change', () => {
  updateRotationControls();
  autoRerunNesting();
});

nestRotateStep.addEventListener('change', () => {
  autoRerunNesting();
});

nestStrategy.addEventListener('change', () => {
  syncModeByAdvancedControls();
  autoRerunNesting();
});

nestMultiStart.addEventListener('change', () => {
  syncModeByAdvancedControls();
  autoRerunNesting();
});

nestSeed.addEventListener('change', () => {
  autoRerunNesting();
});

nestCommonLineEnabled.addEventListener('change', () => {
  updateCommonLineControls();
  syncModeByAdvancedControls();
  autoRerunNesting();
});

nestCommonLineDist.addEventListener('change', () => {
  autoRerunNesting();
});

nestCommonLineMinLen.addEventListener('change', () => {
  autoRerunNesting();
});

btnNestRun.addEventListener('click', runNesting);

// ─── Экспорт ────────────────────────────────────────────────────────

btnExportDXF.addEventListener('click', () => {
  if (!currentNestResult) return;
  void (async () => {
    try {
      const dxfBlob = await apiPostBlob('/api/export/dxf', { nestingResult: currentNestResult });
      downloadBlob(dxfBlob, 'nesting.dxf');
    } catch (err) {
      alert(`Ошибка экспорта DXF: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
});

btnExportCSV.addEventListener('click', () => {
  if (!currentNestResult) return;
  void (async () => {
    try {
      const csvBlob = await apiPostBlob('/api/export/csv', { nestingResult: currentNestResult, fileName: 'nesting' });
      downloadBlob(csvBlob, 'nesting.csv');
    } catch (err) {
      alert(`Ошибка экспорта CSV: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
});

btnExport.addEventListener('click', () => {
  if (!currentNestResult) return;
  void (async () => {
    try {
      const dxfBlob = await apiPostBlob('/api/export/dxf', { nestingResult: currentNestResult });
      downloadBlob(dxfBlob, 'nesting.dxf');
    } catch (err) {
      alert(`Ошибка экспорта DXF: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
});

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function updateNestItems(): void {
  const checked = loadedFiles.filter(f => f.checked);
  nestItemsEmpty.style.display = checked.length === 0 ? '' : 'none';
  nestItemsEl.innerHTML = '';

  for (const f of checked) {
    const bb = f.doc.totalBBox;
    const w = bb ? Math.abs(bb.max.x - bb.min.x) : 0;
    const h = bb ? Math.abs(bb.max.y - bb.min.y) : 0;
    const sizeStr = `${w.toFixed(0)}×${h.toFixed(0)}`;

    const row = document.createElement('div');
    row.className = 'np-item-row';
    row.innerHTML = `
      <span class="np-item-name">${f.name}</span>
      <span class="np-item-size">${sizeStr}</span>
      <button class="np-qty-btn" data-delta="-10">−10</button>
      <input type="number" class="np-item-qty" min="1" value="${f.quantity}" />
      <button class="np-qty-btn" data-delta="10">+10</button>
      <button class="np-qty-rst" title="Сбросить на 1">↺</button>
    `;
    const qtyInput = row.querySelector('input') as HTMLInputElement;
    const setQty = (v: number) => { f.quantity = Math.max(1, v); qtyInput.value = String(f.quantity); autoRerunNesting(); };
    qtyInput.addEventListener('change', () => setQty(parseInt(qtyInput.value) || 1));
    row.querySelectorAll('.np-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => setQty(f.quantity + Number((btn as HTMLElement).dataset.delta)));
    });
    row.querySelector('.np-qty-rst')!.addEventListener('click', () => setQty(1));
    nestItemsEl.appendChild(row);
  }
}

function getSheetSize(): { width: number; height: number } {
  if (nestPreset.value === 'custom') {
    return { width: Number(nestW.value) || 1250, height: Number(nestH.value) || 2500 };
  }
  return SHEET_PRESETS[Number(nestPreset.value)]!.size;
}

function getNestingOptions(): NestingOptions {
  const raw = Number(nestRotateStep.value);
  const rotationAngleStepDeg: 1 | 2 | 5 = raw === 1 || raw === 5 ? raw : 2;
  const strategy = nestStrategy.value === 'maxrects_bbox' ? 'maxrects_bbox' : 'blf_bbox';
  const seed = Number.isFinite(Number(nestSeed.value)) ? Math.trunc(Number(nestSeed.value)) : 0;
  const maxMergeDistanceMm = Number.isFinite(Number(nestCommonLineDist.value)) ? Number(nestCommonLineDist.value) : 0.2;
  const minSharedLenMm = Number.isFinite(Number(nestCommonLineMinLen.value)) ? Number(nestCommonLineMinLen.value) : 20;
  return {
    rotationEnabled: nestRotateEnabled.checked,
    rotationAngleStepDeg,
    strategy,
    multiStart: nestMultiStart.checked,
    seed,
    commonLine: {
      enabled: nestCommonLineEnabled.checked,
      maxMergeDistanceMm,
      minSharedLenMm,
    },
  };
}

function getPlacedAngleDeg(p: { angleDeg?: unknown; rotated?: unknown }): number {
  if (typeof p.angleDeg === 'number' && Number.isFinite(p.angleDeg)) return p.angleDeg;
  return p.rotated === true ? 90 : 0;
}

async function runNesting(): Promise<void> {
  const checked = loadedFiles.filter(f => f.checked);
  if (checked.length === 0) return;

  const sheet = getSheetSize();
  const gap = Number(nestGap.value) || 5;
  const options = getNestingOptions();
  const effectiveGap = options.commonLine?.enabled ? 0 : gap;
  lastNestingOptions = {
    ...options,
    commonLine: options.commonLine ? { ...options.commonLine } : undefined,
  };

  const items = checked.map(f => {
    const bb = f.doc.totalBBox;
    const w = bb ? Math.abs(bb.max.x - bb.min.x) : 0;
    const h = bb ? Math.abs(bb.max.y - bb.min.y) : 0;
    return { id: f.id, name: f.name, width: w, height: h, quantity: f.quantity };
  });

  try {
    const response = await apiPostJSON<{ success: boolean; data: NestingResult }>('/api/nest', {
      items,
      sheet,
      gap: effectiveGap,
      rotationEnabled: options.rotationEnabled,
      rotationAngleStepDeg: options.rotationAngleStepDeg,
      strategy: options.strategy,
      multiStart: options.multiStart,
      seed: options.seed,
      commonLine: options.commonLine,
    });
    currentNestResult = response.data;
    nestingComputeMode = 'api';
    updateModeBadge();
  } catch {
    currentNestResult = nestItems(items, sheet, effectiveGap, options);
    nestingComputeMode = 'local';
    updateModeBadge();
  }

  showNestResults();
  enterNestingMode();
}

function showNestResults(): void {
  if (!currentNestResult) return;
  const r = currentNestResult;
  const commonLineActive = lastNestingOptions?.commonLine?.enabled ?? false;
  const sharedCutLength = Number.isFinite(r.sharedCutLength) ? r.sharedCutLength : 0;
  const pierceDelta = Number.isFinite(r.pierceDelta) ? r.pierceDelta : 0;

  // Суммарные врезки и длина реза по всем размещённым деталям
  let totalPierces = 0;
  let totalCutLen = 0;
  for (const sheet of r.sheets) {
    for (const p of sheet.placed) {
      const f = loadedFiles.find(lf => lf.id === p.itemId);
      if (f) {
        totalPierces += f.stats.totalPierces;
        totalCutLen += f.stats.totalCutLength;
      }
    }
  }
  const cutM = totalCutLen / 1000;
  const cutStr = cutM >= 1 ? cutM.toFixed(2) + ' м' : totalCutLen.toFixed(1) + ' мм';
  const sharedCutStr = (sharedCutLength / 1000).toFixed(2) + ' м';

  nestResultCards.innerHTML = `
    <div class="np-card"><div class="np-card-val">${r.totalSheets}</div><div class="np-card-label">Листов</div></div>
    <div class="np-card"><div class="np-card-val">${r.avgFillPercent}%</div><div class="np-card-label">Заполнение</div></div>
    <div class="np-card"><div class="np-card-val">${totalPierces}</div><div class="np-card-label">Врезок</div></div>
    <div class="np-card"><div class="np-card-val">${cutStr}</div><div class="np-card-label">Длина реза</div></div>
    <div class="np-card"><div class="np-card-val">${sharedCutStr}</div><div class="np-card-label">Экономия реза</div></div>
    <div class="np-card"><div class="np-card-val">−${pierceDelta}</div><div class="np-card-label">Экономия врезок</div></div>
  `;

  let commonLineSummary = '';
  if (commonLineActive) {
    commonLineSummary = sharedCutLength > 0 || pierceDelta > 0
      ? ' • Совместный рез: ВКЛ'
      : ' • Совместный рез: ВКЛ (совпадения не найдены)';
  }
  nestResultSummary.textContent = `Размещено ${r.totalPlaced} из ${r.totalRequired} деталей${commonLineSummary}`;
  nestResults.classList.remove('hidden');
  
  // Показываем кнопки экспорта
  btnExportDXF.style.display = 'flex';
  btnExportCSV.style.display = 'flex';
  btnExport.style.display = 'flex';
}

function enterNestingMode(): void {
  nestingMode = true;
  nestingScroll.classList.add('visible');
  renderAllNestingSheets();
}

function exitNestingMode(): void {
  nestingMode = false;
  nestingScroll.classList.remove('visible');
  currentNestResult = null;
}

nestClose.addEventListener('click', exitNestingMode);

function autoRerunNesting(): void {
  if (!nestingMode && !currentNestResult) return;
  void runNesting();
}

const PART_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6',
];

function renderAllNestingSheets(): void {
  if (!currentNestResult || currentNestResult.sheets.length === 0) return;

  const r = currentNestResult;
  const containerRect = container.getBoundingClientRect();
  const dpr = devicePixelRatio;
  const viewW = containerRect.width;
  const viewH = containerRect.height;

  const sw = r.sheet.width;
  const sh = r.sheet.height;
  const margin = 16;
  const gap = 12;
  const labelH = 20;
  const n = r.sheets.length;

  // Подбираем кол-во колонок: стремимся к 4-5 в ряд, но не больше чем листов
  const maxCols = Math.min(n, Math.max(1, Math.floor((viewW - margin) / 180)));
  const cols = Math.min(n, Math.max(1, maxCols));
  const rows = Math.ceil(n / cols);

  // Размер одной ячейки
  const cellW = (viewW - margin * 2 - gap * (cols - 1)) / cols;
  const sheetAspect = sh / sw;
  const sheetDrawW = cellW;
  const sheetDrawH = cellW * sheetAspect;
  const scale = sheetDrawW / sw;
  const cellH = labelH + sheetDrawH + 4;

  const totalH = Math.max(viewH, margin * 2 + rows * cellH + (rows - 1) * gap);

  const cw = viewW * dpr;
  const ch = totalH * dpr;
  nestingCanvas.width = cw;
  nestingCanvas.height = ch;
  nestingCanvas.style.width = `${viewW}px`;
  nestingCanvas.style.height = `${totalH}px`;

  const ctx = nestingCanvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0f1117';
  ctx.fillRect(0, 0, viewW, totalH);

  // Глобальная карта цветов по itemId
  const colorMap = new Map<number, number>();
  let ci = 0;
  for (const s of r.sheets) {
    for (const p of s.placed) {
      if (!colorMap.has(p.itemId)) colorMap.set(p.itemId, ci++);
    }
  }

  nestCellRects = [];
  for (let si = 0; si < n; si++) {
    const sheet = r.sheets[si]!;
    const col = si % cols;
    const row = Math.floor(si / cols);
    const cellX = margin + col * (cellW + gap);
    const cellY = margin + row * (cellH + gap);
    nestCellRects.push({ x: cellX, y: cellY + labelH, w: sheetDrawW, h: sheetDrawH, si });

    // Заголовок
    const labelSize = Math.max(8, Math.min(11, cellW * 0.04));
    ctx.font = `600 ${labelSize}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`#${si + 1}  ${sheet.fillPercent}%  (${sheet.placed.length})`, cellX, cellY);

    const ox = cellX;
    const oy = cellY + labelH;

    // Контур листа
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(ox, oy, sheetDrawW, sheetDrawH);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, sheetDrawW, sheetDrawH);

    // Детали
    for (const p of sheet.placed) {
      const cIdx = colorMap.get(p.itemId) ?? 0;
      const color = PART_COLORS[cIdx % PART_COLORS.length]!;
      const px = ox + p.x * scale;
      const py = oy + p.y * scale;
      const pw = p.width * scale;
      const ph = p.height * scale;

      // Фон и обводка bounding box
      ctx.fillStyle = color + '10';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = color + '40';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, pw, ph);

      // Рисуем реальные контуры детали
      const file = loadedFiles.find(lf => lf.id === p.itemId);
      if (file && file.doc.totalBBox) {
        const bb = file.doc.totalBBox;
        const bbW = bb.max.x - bb.min.x;
        const bbH = bb.max.y - bb.min.y;
        if (bbW > 0 && bbH > 0) {
          const angleDeg = getPlacedAngleDeg(p);
          const angleRad = (angleDeg * Math.PI) / 180;
          const c = Math.abs(Math.cos(angleRad));
          const s = Math.abs(Math.sin(angleRad));
          const rotW = bbW * c + bbH * s;
          const rotH = bbW * s + bbH * c;
          const partScale = Math.min(pw / rotW, ph / rotH);

          ctx.save();
          ctx.beginPath();
          ctx.rect(px, py, pw, ph);
          ctx.clip();

          ctx.translate(px + pw / 2, py + ph / 2);
          ctx.rotate(-(angleDeg * Math.PI) / 180);
          ctx.scale(partScale, -partScale);
          ctx.translate(-(bb.min.x + bbW / 2), -(bb.min.y + bbH / 2));

          const pixelSize = 1 / partScale;
          const entOpts: EntityRenderOptions = {
            arcSegments: 32,
            splineSegments: 32,
            ellipseSegments: 32,
            pixelSize,
            viewExtent: Math.max(bbW, bbH) * 2,
          };

          for (const fe of file.doc.flatEntities) {
            ctx.strokeStyle = color;
            ctx.lineWidth = pixelSize * 1.2;
            ctx.fillStyle = color;
            renderEntity(ctx, fe, entOpts);
          }

          ctx.restore();
        }
      }

      // Имя детали
      const fontSize = Math.min(9, pw * 0.18, ph * 0.28);
      if (fontSize > 3.5) {
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = color + 'cc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const label = p.name.replace(/\.dxf$/i, '');
        ctx.fillText(label, px + pw / 2, py + ph - 1, pw - 2);
      }
    }
  }

  // Общая подпись внизу
  const footY = margin + rows * (cellH + gap) + 4;
  ctx.font = '400 10px JetBrains Mono, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${sw}×${sh} мм  |  ${n} листов  |  ${r.avgFillPercent}% заполнение`, margin, footY);
}

// Обновляем nesting canvas при resize
const nestResizeObs = new ResizeObserver(() => {
  if (nestingMode) renderAllNestingSheets();
});
nestResizeObs.observe(container);

// ─── Лупа при наведении на лист ──────────────────────────────────────

let zoomLevel = 1;
let zoomPanX = 0;
let zoomPanY = 0;
let zoomPopupLocked = false;
let zoomPanning = false;
let zoomPanStartX = 0;
let zoomPanStartY = 0;
let zoomHideTimer: ReturnType<typeof setTimeout> | null = null;

function renderZoomSheet(sheetIndex: number): void {
  if (!currentNestResult) return;
  const sheet = currentNestResult.sheets[sheetIndex];
  if (!sheet) return;

  const r = currentNestResult;
  const sw = r.sheet.width;
  const sh = r.sheet.height;
  const dpr = devicePixelRatio;

  const maxW = Math.min(600, window.innerWidth * 0.55);
  const maxH = Math.min(500, window.innerHeight * 0.55);
  const baseScale = Math.min(maxW / sw, maxH / sh);
  const popW = Math.round(sw * baseScale);
  const popH = Math.round(sh * baseScale);
  const zScale = baseScale * zoomLevel;

  nestZoomCanvas.width = popW * dpr;
  nestZoomCanvas.height = popH * dpr;
  nestZoomCanvas.style.width = `${popW}px`;
  nestZoomCanvas.style.height = `${popH}px`;

  const ctx = nestZoomCanvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#14161e';
  ctx.fillRect(0, 0, popW, popH);

  ctx.save();
  ctx.translate(zoomPanX, zoomPanY);

  // Контур листа
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, sw * zScale, sh * zScale);

  // Карта цветов
  const colorMap = new Map<number, number>();
  let ci = 0;
  for (const s of r.sheets) {
    for (const p of s.placed) {
      if (!colorMap.has(p.itemId)) colorMap.set(p.itemId, ci++);
    }
  }

  for (const p of sheet.placed) {
    const cIdx = colorMap.get(p.itemId) ?? 0;
    const color = PART_COLORS[cIdx % PART_COLORS.length]!;
    const px = p.x * zScale;
    const py = p.y * zScale;
    const pw = p.width * zScale;
    const ph = p.height * zScale;

    ctx.fillStyle = color + '15';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px, py, pw, ph);

    const file = loadedFiles.find(lf => lf.id === p.itemId);
    if (file && file.doc.totalBBox) {
      const bb = file.doc.totalBBox;
      const bbW = bb.max.x - bb.min.x;
      const bbH = bb.max.y - bb.min.y;
      if (bbW > 0 && bbH > 0) {
        const angleDeg = getPlacedAngleDeg(p);
        const angleRad = (angleDeg * Math.PI) / 180;
        const c = Math.abs(Math.cos(angleRad));
        const s = Math.abs(Math.sin(angleRad));
        const rotW = bbW * c + bbH * s;
        const rotH = bbW * s + bbH * c;
        const partScale = Math.min(pw / rotW, ph / rotH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();

        ctx.translate(px + pw / 2, py + ph / 2);
        ctx.rotate(-(angleDeg * Math.PI) / 180);
        ctx.scale(partScale, -partScale);
        ctx.translate(-(bb.min.x + bbW / 2), -(bb.min.y + bbH / 2));

        const pixelSize = 1 / partScale;
        const entOpts: EntityRenderOptions = {
          arcSegments: 64,
          splineSegments: 64,
          ellipseSegments: 64,
          pixelSize,
          viewExtent: Math.max(bbW, bbH) * 2,
        };

        for (const fe of file.doc.flatEntities) {
          ctx.strokeStyle = color;
          ctx.lineWidth = pixelSize * 1.5;
          ctx.fillStyle = color;
          renderEntity(ctx, fe, entOpts);
        }

        ctx.restore();
      }
    }

    const fontSize = Math.min(12, pw * 0.15, ph * 0.22);
    if (fontSize > 5) {
      ctx.font = `500 ${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = color + 'dd';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = p.name.replace(/\.dxf$/i, '');
      ctx.fillText(label, px + pw / 2, py + ph - 2, pw - 4);
    }
  }

  ctx.restore();

  // Zoom indicator
  if (zoomLevel !== 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(popW - 52, 4, 48, 18);
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`×${zoomLevel.toFixed(1)}`, popW - 8, 7);
  }

  nestZoomLabel.textContent = `Лист ${sheetIndex + 1}  —  ${sheet.placed.length} дет.  —  ${sheet.fillPercent}%`;
}

function positionPopup(mouseX: number, mouseY: number): void {
  const popW = nestZoomPopup.offsetWidth;
  const popH = nestZoomPopup.offsetHeight;
  let left = mouseX + 16;
  let top = mouseY - popH / 2;
  if (left + popW > window.innerWidth) left = mouseX - popW - 8;
  if (top < 4) top = 4;
  if (top + popH > window.innerHeight - 4) top = window.innerHeight - popH - 4;
  nestZoomPopup.style.left = `${left}px`;
  nestZoomPopup.style.top = `${top}px`;
}

function showZoomPopup(sheetIndex: number, mouseX: number, mouseY: number): void {
  if (zoomHideTimer) { clearTimeout(zoomHideTimer); zoomHideTimer = null; }
  zoomLevel = 1;
  zoomPanX = 0;
  zoomPanY = 0;
  renderZoomSheet(sheetIndex);
  positionPopup(mouseX, mouseY);
  nestZoomPopup.classList.add('visible');
}

function hideZoomPopup(): void {
  if (zoomPopupLocked) return;
  nestZoomPopup.classList.remove('visible');
  nestHoveredSheet = -1;
  zoomLevel = 1;
  zoomPanX = 0;
  zoomPanY = 0;
  if (zoomHideTimer) { clearTimeout(zoomHideTimer); zoomHideTimer = null; }
}

function scheduleHideZoomPopup(): void {
  if (zoomPopupLocked) return;
  if (zoomHideTimer) clearTimeout(zoomHideTimer);
  zoomHideTimer = setTimeout(() => { zoomHideTimer = null; hideZoomPopup(); }, 300);
}

// Zoom колёсиком — работает и на листе в основном canvas, и на popup
function applyZoomWheel(deltaY: number): void {
  if (nestHoveredSheet < 0) return;
  const oldZoom = zoomLevel;
  const factor = deltaY < 0 ? 1.15 : 1 / 1.15;
  zoomLevel = Math.max(0.5, Math.min(20, zoomLevel * factor));

  // Zoom к центру popup
  const cw = nestZoomCanvas.offsetWidth / 2;
  const ch = nestZoomCanvas.offsetHeight / 2;
  const ratio = zoomLevel / oldZoom;
  zoomPanX = cw - (cw - zoomPanX) * ratio;
  zoomPanY = ch - (ch - zoomPanY) * ratio;

  zoomPopupLocked = true;
  renderZoomSheet(nestHoveredSheet);
}

nestingScroll.addEventListener('wheel', (e) => {
  if (nestHoveredSheet < 0 && !nestZoomPopup.classList.contains('visible')) return;
  e.preventDefault();
  applyZoomWheel(e.deltaY);
}, { passive: false });

nestZoomCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (nestHoveredSheet < 0) return;

  const rect = nestZoomCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const oldZoom = zoomLevel;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  zoomLevel = Math.max(0.5, Math.min(20, zoomLevel * factor));

  const ratio = zoomLevel / oldZoom;
  zoomPanX = mx - (mx - zoomPanX) * ratio;
  zoomPanY = my - (my - zoomPanY) * ratio;

  zoomPopupLocked = true;
  renderZoomSheet(nestHoveredSheet);
}, { passive: false });

// Pan зажатой мышкой
nestZoomCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  zoomPanning = true;
  zoomPanStartX = e.clientX - zoomPanX;
  zoomPanStartY = e.clientY - zoomPanY;
  zoomPopupLocked = true;
});

window.addEventListener('mousemove', (e) => {
  if (!zoomPanning) return;
  zoomPanX = e.clientX - zoomPanStartX;
  zoomPanY = e.clientY - zoomPanStartY;
  if (nestHoveredSheet >= 0) renderZoomSheet(nestHoveredSheet);
});

window.addEventListener('mouseup', () => {
  zoomPanning = false;
});

// Вход мыши на popup — отменяем скрытие, фиксируем
nestZoomPopup.addEventListener('mouseenter', () => {
  if (zoomHideTimer) { clearTimeout(zoomHideTimer); zoomHideTimer = null; }
  zoomPopupLocked = true;
});

// Уход мыши с popup — разблокируем и скрываем
nestZoomPopup.addEventListener('mouseleave', () => {
  zoomPopupLocked = false;
  zoomPanning = false;
  hideZoomPopup();
});

// Двойной клик — сброс zoom
nestZoomCanvas.addEventListener('dblclick', () => {
  zoomLevel = 1;
  zoomPanX = 0;
  zoomPanY = 0;
  if (nestHoveredSheet >= 0) renderZoomSheet(nestHoveredSheet);
});

nestingScroll.addEventListener('mousemove', (e) => {
  if (!currentNestResult || nestCellRects.length === 0) {
    zoomPopupLocked = false; scheduleHideZoomPopup(); return;
  }
  const rect = nestingScroll.getBoundingClientRect();
  const mx = e.clientX - rect.left + nestingScroll.scrollLeft;
  const my = e.clientY - rect.top + nestingScroll.scrollTop;

  let found = -1;
  for (const cell of nestCellRects) {
    if (mx >= cell.x && mx <= cell.x + cell.w && my >= cell.y && my <= cell.y + cell.h) {
      found = cell.si;
      break;
    }
  }

  if (found >= 0) {
    if (zoomHideTimer) { clearTimeout(zoomHideTimer); zoomHideTimer = null; }
    if (nestHoveredSheet !== found) {
      // Смена листа — сбрасываем lock и показываем новый
      zoomPopupLocked = false;
      nestHoveredSheet = found;
      showZoomPopup(found, e.clientX, e.clientY);
    } else if (!zoomPopupLocked) {
      positionPopup(e.clientX, e.clientY);
    }
  } else if (!zoomPopupLocked) {
    scheduleHideZoomPopup();
  }
});

nestingScroll.addEventListener('mouseleave', () => {
  if (!zoomPopupLocked) scheduleHideZoomPopup();
});

// ─── Адаптивность (мобильные панели) ─────────────────────────────────

function isMobile(): boolean { return window.innerWidth <= 768; }

function closeMobilePanels(): void {
  sidebarFiles.classList.remove('mobile-open');
  sidebarInspector.classList.remove('mobile-open');
  nestingPanel.classList.remove('mobile-open');
  mobileBackdrop.classList.remove('active');
}

function openMobilePanel(panel: HTMLElement): void {
  closeMobilePanels();
  panel.classList.add('mobile-open');
  mobileBackdrop.classList.add('active');
}

mobileBackdrop.addEventListener('click', closeMobilePanels);

// Поведение кнопок для мобильных
btnInspector.addEventListener('click', () => {
  if (isMobile()) {
    const isOpen = sidebarInspector.classList.contains('mobile-open');
    closeMobilePanels();
    if (!isOpen) openMobilePanel(sidebarInspector);
  }
});

btnNesting.addEventListener('click', () => {
  if (isMobile()) {
    const isOpen = nestingPanel.classList.contains('mobile-open');
    closeMobilePanels();
    if (!isOpen) openMobilePanel(nestingPanel);
  }
});

// Тап по логотипу — открыть/закрыть sidebar файлов на мобильных
document.querySelector('.toolbar .logo')?.addEventListener('click', () => {
  if (!isMobile()) return;
  const isOpen = sidebarFiles.classList.contains('mobile-open');
  closeMobilePanels();
  if (!isOpen) openMobilePanel(sidebarFiles);
});

// Закрываем панели при resize на десктоп
window.addEventListener('resize', () => {
  if (!isMobile()) closeMobilePanels();
});

// ─── Клавиатура ─────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); openFileDialog(); return; }
  if (e.key === 'f' || e.key === 'F') { renderer.zoomToFit(); updateStatusBar(); }
  if (e.key === 'Escape') {
    if (isMobile() && mobileBackdrop.classList.contains('active')) { closeMobilePanels(); return; }
    if (nestingMode) { exitNestingMode(); }
    else { renderer.clearSelection(); clearInspector(); }
  }
  if (e.key === 'g' || e.key === 'G') { btnGrid.click(); }
});
