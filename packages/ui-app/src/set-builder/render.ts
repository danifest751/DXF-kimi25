import { loadedFiles, workspaceCatalogs } from '../state.js';
import { getLocale, t } from '../i18n/index.js';
import { canRunNesting, getMaterialAssignment, getSetItem, getSetRows, getTotals, getAggregatedIssues } from './state.js';
import { renderEntity } from '../../../core-engine/src/render/entity-renderer.js';
import type { EntityRenderOptions } from '../../../core-engine/src/render/entity-renderer.js';
import type { NestingResult } from '../../../core-engine/src/nesting/index.js';
import type { LibraryItem, SetBuilderState, SheetResult } from './types.js';
import { calcWeightKg, findMaterial, formatMaterialLabel, formatWeightKg, getMaterialGroups, getGradesByGroup, getThicknessesByGrade } from './materials.js';
import { esc, fmtLen, sortMark, statusLabel, thumbSvg } from './utils.js';
import type { SheetPreset } from './context.js';
import { getVisibleLibraryItems } from './library.js';

export function renderDxfThumbDataUrl(
  sourceFileId: number,
  width: number,
  height: number,
  angleDeg: number,
  dxfThumbCache: Map<string, string>,
  padPx = 0,
): string | null {
  const cacheKey = `${sourceFileId}:${width}x${height}:${angleDeg}:${padPx}`;
  const cached = dxfThumbCache.get(cacheKey);
  if (cached) return cached;

  const lf = loadedFiles.find((f) => f.id === sourceFileId);
  if (!lf || lf.loading || !lf.doc) return null;

  const bb = lf.doc.totalBBox;
  const bbW = bb ? Math.max(1e-6, bb.max.x - bb.min.x) : 0;
  const bbH = bb ? Math.max(1e-6, bb.max.y - bb.min.y) : 0;
  if (bbW <= 0 || bbH <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(7, 11, 18, 0.8)';
  ctx.fillRect(0, 0, width, height);

  const angleRad = (angleDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(angleRad));
  const sinA = Math.abs(Math.sin(angleRad));
  const rotW = bbW * cosA + bbH * sinA;
  const rotH = bbW * sinA + bbH * cosA;

  const pad = padPx > 0 ? padPx : Math.max(4, Math.round(Math.min(width, height) * 0.06));
  const availW = Math.max(1, width - pad * 2);
  const availH = Math.max(1, height - pad * 2);
  const scale = Math.max(1e-6, Math.min(availW / rotW, availH / rotH));

  const cx = bb!.min.x + bbW / 2;
  const cy = bb!.min.y + bbH / 2;
  const pixelSize = 1 / scale;
  const opts: EntityRenderOptions = {
    arcSegments: 64,
    splineSegments: 64,
    ellipseSegments: 64,
    pixelSize,
    viewExtent: Math.max(bbW, bbH) * 2,
  };

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-angleRad);
  ctx.scale(scale, -scale);
  ctx.translate(-cx, -cy);
  for (const fe of lf.doc.flatEntities) {
    renderEntity(ctx, fe, opts);
  }
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  dxfThumbCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export function buildThumbMarkup(
  item: LibraryItem,
  dxfThumbCache: Map<string, string>,
  large = false,
): string {
  if (item.sourceFileId !== undefined) {
    const width = large ? 760 : 112;
    const height = large ? 460 : 72;
    const dataUrl = renderDxfThumbDataUrl(item.sourceFileId, width, height, 0, dxfThumbCache);
    if (dataUrl) {
      return `<img class="sb-thumb-real" src="${dataUrl}" alt="${esc(item.name)}" loading="lazy" />`;
    }
  }
  return thumbSvg(item, large);
}

export function buildSheetPlacementsMarkup(
  sheet: SheetResult,
  dxfThumbCache: Map<string, string>,
): string {
  const noGap = sheet.gap === 0;
  const safeW = Math.max(1, sheet.sheetWidth);
  const safeH = Math.max(1, sheet.sheetHeight);
  const ratio = (safeW / safeH).toFixed(4);
  const placements = sheet.placements
    .slice(0, 120)
    .map((p) => {
      const left = Math.max(0, Math.min(100, (p.x / safeW) * 100));
      const width = Math.max(0.9, Math.min(100, (p.w / safeW) * 100));
      const top = Math.max(0, Math.min(100, (p.y / safeH) * 100));
      const height = Math.max(0.9, Math.min(100, (p.h / safeH) * 100));
      const angle = typeof p.angleDeg === 'number' && Number.isFinite(p.angleDeg) ? p.angleDeg : 0;
      // Render thumb with correct aspect ratio matching the placed bounding box
      const thumbSize = 256;
      const tRatio = p.w > 0 && p.h > 0 ? p.w / p.h : 1;
      const tW = tRatio >= 1 ? thumbSize : Math.round(thumbSize * tRatio);
      const tH = tRatio >= 1 ? Math.round(thumbSize / tRatio) : thumbSize;
      const thumb = renderDxfThumbDataUrl(p.itemId, Math.max(4, tW), Math.max(4, tH), angle, dxfThumbCache, 1);
      return `
        <div class="sb-sheet-part${noGap ? ' sb-sheet-part--no-gap' : ''}" style="left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${width.toFixed(3)}%;height:${height.toFixed(3)}%;" title="${esc(p.name)}">
          ${thumb ? `<img class="sb-sheet-part-img" src="${thumb}" alt="${esc(p.name)}" loading="lazy" />` : '<span class="sb-sheet-part-fallback">DXF</span>'}
          <span class="sb-sheet-part-name">${esc(p.name)}</span>
        </div>
      `;
    })
    .join('');
  return `<div class="sb-sheet-canvas" style="--sheet-ratio:${ratio};">${placements}</div>`;
}

export function buildLibraryRow(
  item: LibraryItem,
  state: SetBuilderState,
  dxfThumbCache: Map<string, string>,
): string {
  const inSet = getSetItem(state, item.id);
  const menuOpen = state.openMenuLibraryId === item.id;
  const draggable = item.sourceFileId !== undefined ? 'draggable="true"' : '';
  const assignment = getMaterialAssignment(state, item.id);
  const matLabel = assignment ? formatMaterialLabel(assignment.materialId) : '';
  const matWeight = (assignment && item.areaMm2 > 0) ? (() => {
    const mat = findMaterial(assignment.materialId);
    return mat ? formatWeightKg(calcWeightKg(item.areaMm2, mat.thicknessMm, mat.densityKgM3)) : '';
  })() : '';
  const matTooltip = assignment
    ? `${esc(matLabel)}${matWeight ? ` · ${esc(matWeight)}` : ''}`
    : esc(t('material.assign'));
  const matIcon = assignment ? '⬡' : '⬡';
  const matIconClass = assignment ? 'sb-icon sb-mat-icon sb-mat-icon--set' : 'sb-icon sb-mat-icon';
  return `
    <div class="sb-lib-row sb-lib-row--table" data-a="lib-row" data-id="${item.id}" ${draggable}>
      <label class="sb-chk"><input type="checkbox" data-a="pick-lib" data-id="${item.id}" ${state.selectedLibraryIds.has(item.id) ? 'checked' : ''} /></label>
      <div class="sb-thumb">${buildThumbMarkup(item, dxfThumbCache)}</div>
      <div class="sb-meta">
        <div class="sb-name">${esc(item.name)}</div>
        <div class="sb-sub">${t('setBuilder.catalog')}: ${esc(item.catalog)} · ${item.w}×${item.h} · ${t('setBuilder.piercesShort')}:${item.pierces} · ${t('setBuilder.cutLengthShort')}:${fmtLen(item.cutLen)} · ${t('setBuilder.layers')}:${item.layersCount}</div>
        <span class="sb-badge sb-badge--${item.status}">${statusLabel(item)}</span>
        ${assignment ? `<span class="sb-badge sb-badge--material" title="${esc(matLabel)}">${esc(matLabel)}${matWeight ? ` · ${esc(matWeight)}` : ''}</span>` : ''}
      </div>
      <div class="sb-stepper" data-a="stepper" data-id="${item.id}">
        <button class="${matIconClass}" data-a="assign-material" data-id="${item.id}" title="${matTooltip}">${matIcon}</button>
        <button data-a="qty-minus" data-id="${item.id}">-</button>
        <span>${inSet?.qty ?? 0}</span>
        <button data-a="qty-plus" data-id="${item.id}">+</button>
      </div>
      <div class="sb-col">${item.w}×${item.h}</div>
      <div class="sb-col">${item.pierces}</div>
      <div class="sb-col">${fmtLen(item.cutLen)}</div>
      <div class="sb-actions">
        <button class="sb-btn" data-a="${inSet ? 'remove-set' : 'add-set'}" data-id="${item.id}">${inSet ? t('setBuilder.remove') : t('setBuilder.addToSet')}</button>
        <button class="sb-icon" data-a="preview-lib" data-id="${item.id}" title="${t('setBuilder.openPreview')}">👁</button>
        <button class="sb-icon" data-a="toggle-menu" data-id="${item.id}" title="${t('setBuilder.menu')}">⋯</button>
        <div class="sb-menu ${menuOpen ? 'open' : ''}">
          <button data-a="menu-delete" data-id="${item.id}">${t('setBuilder.menu.delete')}</button>
          <button data-a="menu-move" data-id="${item.id}">${t('setBuilder.menu.moveToCatalog')}</button>
          <button data-a="menu-download" data-id="${item.id}">${t('setBuilder.menu.download')}</button>
        </div>
      </div>
    </div>
  `;
}

export function renderMaterialModal(
  state: SetBuilderState,
): string {
  const itemId = state.materialModalOpenForId;
  if (itemId === null) return '';
  const item = state.library.find((it) => it.id === itemId);
  if (!item) return '';

  const assignment = getMaterialAssignment(state, itemId);
  const parts = assignment?.materialId.split('|') ?? [];
  const currentGroup = parts[0] ?? state.lastUsedMaterialId?.split('|')[0] ?? '';
  const currentGrade = parts[1] ?? state.lastUsedMaterialId?.split('|')[1] ?? '';
  const currentThickness = parts[2] ?? state.lastUsedMaterialId?.split('|')[2] ?? '';

  const groups = getMaterialGroups();
  const grades = currentGroup ? getGradesByGroup(currentGroup) : [];
  const thicknesses = (currentGroup && currentGrade) ? getThicknessesByGrade(currentGroup, currentGrade) : [];

  const areaCm2 = item.areaMm2 > 0 ? (item.areaMm2 / 100).toFixed(1) : null;
  const weightStr = (() => {
    if (!currentGroup || !currentGrade || !currentThickness || !item.areaMm2) return null;
    const matId = `${currentGroup}|${currentGrade}|${currentThickness}`;
    const mat = findMaterial(matId);
    if (!mat) return null;
    return formatWeightKg(calcWeightKg(item.areaMm2, mat.thicknessMm, mat.densityKgM3));
  })();

  return `
    <div class="sb-modal-backdrop sb-modal-backdrop--material">
      <div class="sb-modal sb-modal--material" role="dialog" aria-modal="true">
        <div class="sb-modal-head">
          <div class="sb-modal-title-text">
            <span class="sb-modal-name">${t('material.title')}</span>
            <span class="sb-modal-catalog">${esc(item.name)}</span>
          </div>
          <button class="sb-icon" data-a="close-material-modal" title="${t('material.cancel')}">✕</button>
        </div>
        <div class="sb-modal-material-body">
          <div class="sb-mat-selects">
            <label class="sb-mat-label">${t('material.group')}</label>
            <select class="sb-select sb-mat-select" data-a="mat-group" data-item-id="${itemId}">
              <option value="">${t('material.selectGroup')}</option>
              ${groups.map((g) => `<option value="${esc(g.key)}" ${currentGroup === g.key ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}
            </select>
            <label class="sb-mat-label">${t('material.grade')}</label>
            <select class="sb-select sb-mat-select" data-a="mat-grade" data-item-id="${itemId}" ${!currentGroup ? 'disabled' : ''}>
              <option value="">${t('material.selectGrade')}</option>
              ${grades.map((g) => `<option value="${esc(g)}" ${currentGrade === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
            </select>
            <label class="sb-mat-label">${t('material.thickness')}</label>
            <select class="sb-select sb-mat-select" data-a="mat-thickness" data-item-id="${itemId}" ${(!currentGroup || !currentGrade) ? 'disabled' : ''}>
              <option value="">${t('material.selectThickness')}</option>
              ${thicknesses.map((th) => `<option value="${th}" ${currentThickness === String(th) ? 'selected' : ''}>${th} ${t('material.unit.mm')}</option>`).join('')}
            </select>
          </div>
          <div class="sb-mat-info">
            ${areaCm2 ? `<div class="sb-mat-stat"><span>${t('material.area')}:</span><b>${areaCm2} ${t('unit.cm2')}</b></div>` : ''}
            ${weightStr ? `<div class="sb-mat-stat sb-mat-stat--weight"><span>${t('material.weight')}:</span><b>${esc(weightStr)}</b></div>` : ''}
          </div>
          <label class="sb-mat-apply-all">
            <input type="checkbox" data-a="mat-apply-all" id="mat-apply-all" />
            <span>${t('material.applyToAll')}</span>
          </label>
          <div class="sb-mat-actions">
            <button class="sb-btn sb-btn--primary" data-a="material-save" data-item-id="${itemId}" data-group="${esc(currentGroup)}" data-grade="${esc(currentGrade)}" data-thickness="${esc(currentThickness)}">${t('material.save')}</button>
            <button class="sb-btn sb-btn--ghost" data-a="close-material-modal">${t('material.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderPreviewModal(
  state: SetBuilderState,
  dxfThumbCache: Map<string, string>,
): string {
  const item = state.previewLibraryId !== null
    ? state.library.find((it) => it.id === state.previewLibraryId) ?? null
    : null;
  if (!item && !state.previewSheetId) return '';

  if (item) {
    const set = getSetItem(state, item.id);
    const allItems = getVisibleLibraryItems(state);
    const idx = allItems.findIndex((it) => it.id === item.id);
    const prevItem = idx > 0 ? allItems[idx - 1] : null;
    const nextItem = idx >= 0 && idx < allItems.length - 1 ? allItems[idx + 1] : null;
    const statusClass = item.status === 'ok' ? 'sb-badge--ok' : item.status === 'warn' ? 'sb-badge--warn' : 'sb-badge--error';
    const area = Math.round(item.w * item.h / 100) / 100;
    const hasPierces = item.pierces > 0 && item.sourceFileId !== undefined;

    return `
      <div class="sb-modal-backdrop">
        <div class="sb-modal sb-modal--dxf">
          <div class="sb-modal-head">
            <div class="sb-modal-title">
              <button class="sb-icon sb-modal-nav" data-a="preview-lib" data-id="${prevItem?.id ?? ''}" ${!prevItem ? 'disabled' : ''} title="${prevItem ? esc(prevItem.name) : ''}">‹</button>
              <div class="sb-modal-title-text">
                <span class="sb-modal-name">${esc(item.name)}</span>
                <span class="sb-modal-catalog">${esc(item.catalog)}</span>
              </div>
              <button class="sb-icon sb-modal-nav" data-a="preview-lib" data-id="${nextItem?.id ?? ''}" ${!nextItem ? 'disabled' : ''} title="${nextItem ? esc(nextItem.name) : ''}">›</button>
            </div>
            <div class="sb-modal-head-right">
              ${hasPierces ? `
              <label class="sb-pierce-toggle ${state.previewShowPierces ? 'on' : ''}" title="${t('setBuilder.pierces')}">
                <input type="checkbox" data-a="toggle-pierces" ${state.previewShowPierces ? 'checked' : ''} />
                <span class="sb-pierce-toggle-dot"></span>
                <span>${t('setBuilder.pierces')}</span>
              </label>` : ''}
              <span class="sb-badge ${statusClass}">${statusLabel(item)}</span>
              <button class="sb-icon" data-a="close-preview" title="${t('setBuilder.close')}">✕</button>
            </div>
          </div>
          <div class="sb-modal-dxf-body">
            <div class="sb-modal-dxf-preview">
              <canvas id="sb-modal-dxf-canvas" class="sb-modal-dxf-canvas" data-source-id="${item.sourceFileId ?? ''}"></canvas>
            </div>
            <div class="sb-modal-dxf-side">
              <div class="sb-modal-stats">
                <div class="sb-modal-stat">
                  <div class="sb-modal-stat-label">${t('setBuilder.size')}</div>
                  <div class="sb-modal-stat-value">${item.w} × ${item.h} ${t('unit.mm')}</div>
                </div>
                <div class="sb-modal-stat">
                  <div class="sb-modal-stat-label">${t('setBuilder.area')}</div>
                  <div class="sb-modal-stat-value">${area} ${t('unit.cm2')}</div>
                </div>
                <div class="sb-modal-stat">
                  <div class="sb-modal-stat-label">${t('setBuilder.pierces')}</div>
                  <div class="sb-modal-stat-value">${item.pierces}</div>
                </div>
                <div class="sb-modal-stat">
                  <div class="sb-modal-stat-label">${t('setBuilder.cutLength')}</div>
                  <div class="sb-modal-stat-value">${fmtLen(item.cutLen)}</div>
                </div>
                <div class="sb-modal-stat">
                  <div class="sb-modal-stat-label">${t('setBuilder.layers')}</div>
                  <div class="sb-modal-stat-value">${item.layersCount}</div>
                </div>
                ${item.issues.length > 0 ? `
                <div class="sb-modal-stat sb-modal-stat--warn">
                  <div class="sb-modal-stat-label">${t('setBuilder.issues.title')}</div>
                  <div class="sb-modal-stat-value sb-modal-stat-issues">${esc(item.issues.join(' · '))}</div>
                </div>` : ''}
                ${(() => {
                  const assignment = getMaterialAssignment(state, item.id);
                  if (!assignment) return `
                <div class="sb-modal-stat sb-modal-stat--material-cta">
                  <button class="sb-btn sb-btn--xs sb-btn--material" data-a="assign-material" data-id="${item.id}">${t('material.assign')}</button>
                </div>`;
                  const mat = findMaterial(assignment.materialId);
                  const label = formatMaterialLabel(assignment.materialId);
                  const weightStr = (mat && item.areaMm2 > 0) ? formatWeightKg(calcWeightKg(item.areaMm2, mat.thicknessMm, mat.densityKgM3)) : null;
                  return `
                <div class="sb-modal-stat sb-modal-stat--material">
                  <div class="sb-modal-stat-label">${t('material.title')}</div>
                  <div class="sb-modal-stat-value sb-modal-stat-value--material">
                    ${esc(label)}
                    <button class="sb-btn sb-btn--xs sb-btn--ghost sb-modal-mat-change" data-a="assign-material" data-id="${item.id}" title="${t('material.assign')}">✎</button>
                  </div>
                </div>
                ${weightStr ? `
                <div class="sb-modal-stat sb-modal-stat--weight">
                  <div class="sb-modal-stat-label">${t('material.weight')}</div>
                  <div class="sb-modal-stat-value sb-modal-stat-value--weight">${esc(weightStr)}</div>
                </div>` : ''}`;
                })()}
              </div>
              <div class="sb-modal-set-block">
                <div class="sb-modal-set-label">${t('setBuilder.tabSet')}</div>
                <div class="sb-modal-set-controls">
                  <button class="sb-btn ${set ? 'sb-btn--ghost' : 'sb-btn--primary'} sb-modal-set-btn" data-a="${set ? 'remove-set' : 'add-set'}" data-id="${item.id}">
                    ${set ? t('setBuilder.removeFromSet') : t('setBuilder.addToSet')}
                  </button>
                  <div class="sb-stepper sb-modal-stepper">
                    <button data-a="qty-minus" data-id="${item.id}" ${!set ? 'disabled' : ''}>−</button>
                    <span>${set?.qty ?? 0}</span>
                    <button data-a="qty-plus" data-id="${item.id}" ${!set ? 'disabled' : ''}>+</button>
                  </div>
                </div>
                ${set ? `<div class="sb-modal-set-hint">${t('setBuilder.totalQty')}: ${set.qty}</div>` : ''}
              </div>
              <div class="sb-modal-nav-footer">
                <span class="sb-modal-counter">${idx + 1} / ${allItems.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const sheet = state.results?.sheets.find((s) => s.id === state.previewSheetId) ?? null;
  if (!sheet) return '';
  const sheets = state.results?.sheets ?? [];
  const sheetIdx = sheets.findIndex((s) => s.id === sheet.id);
  const prevSheet = sheetIdx > 0 ? sheets[sheetIdx - 1] : null;
  const nextSheet = sheetIdx >= 0 && sheetIdx < sheets.length - 1 ? sheets[sheetIdx + 1] : null;
  const utilizationClamped = Math.max(0, Math.min(100, sheet.utilization));
  const utilizationColor = utilizationClamped >= 75 ? '#57ffbc' : utilizationClamped >= 50 ? '#ffd26f' : '#ff8b98';

  return `
    <div class="sb-modal-backdrop">
      <div class="sb-modal sb-modal--sheet">
        <div class="sb-modal-head">
          <div class="sb-modal-title">
            <button class="sb-icon sb-modal-nav" data-a="preview-sheet" data-sheet="${prevSheet?.id ?? ''}" ${!prevSheet ? 'disabled' : ''} title="${prevSheet?.id.toUpperCase() ?? ''}">‹</button>
            <div class="sb-modal-title-text">
              <span class="sb-modal-name">${t('setBuilder.sheet')} ${sheetIdx + 1}</span>
              <span class="sb-modal-catalog">${sheet.sheetWidth} × ${sheet.sheetHeight} ${t('unit.mm')}</span>
            </div>
            <button class="sb-icon sb-modal-nav" data-a="preview-sheet" data-sheet="${nextSheet?.id ?? ''}" ${!nextSheet ? 'disabled' : ''} title="${nextSheet?.id.toUpperCase() ?? ''}">›</button>
          </div>
          <div class="sb-modal-head-right">
            <span class="sb-modal-counter">${sheetIdx + 1} / ${sheets.length}</span>
            <button class="sb-icon" data-a="close-preview" title="${t('setBuilder.close')}">✕</button>
          </div>
        </div>
        <div class="sb-modal-sheet-body">
          <div class="sb-modal-sheet-preview">${buildSheetPlacementsMarkup(sheet, dxfThumbCache)}</div>
          <div class="sb-modal-sheet-side">
            <div class="sb-modal-util-block">
              <div class="sb-modal-util-label">${t('setBuilder.utilization')}</div>
              <div class="sb-modal-util-bar">
                <div class="sb-modal-util-fill" style="width:${utilizationClamped}%;background:${utilizationColor};"></div>
              </div>
              <div class="sb-modal-util-value" style="color:${utilizationColor};">${sheet.utilization}%</div>
            </div>
            <div class="sb-modal-stats">
              <div class="sb-modal-stat">
                <div class="sb-modal-stat-label">${t('setBuilder.partCount')}</div>
                <div class="sb-modal-stat-value">${sheet.partCount}</div>
              </div>
              <div class="sb-modal-stat">
                <div class="sb-modal-stat-label">${t('setBuilder.size')}</div>
                <div class="sb-modal-stat-value">${sheet.sheetWidth} × ${sheet.sheetHeight}</div>
              </div>
            </div>
            ${sheet.hash ? `
            <div class="sb-modal-hash-block">
              <div class="sb-modal-stat-label">${t('setBuilder.hash')}</div>
              <code class="sb-hash-code sb-modal-hash-code" data-a="copy-hash" data-hash="${sheet.hash}" title="${t('setBuilder.copyHash')}">${sheet.hash}</code>
            </div>` : ''}
            <div class="sb-modal-sheet-actions">
              <button class="sb-btn sb-btn--primary" data-a="export-sheet" data-index="${sheetIdx}">${t('setBuilder.exportDxf')}</button>
              <button class="sb-btn sb-btn--ghost" data-a="copy-hash" data-hash="${sheet.hash}" ${sheet.hash ? '' : 'disabled'}>${t('setBuilder.copyHash')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderMain(
  root: HTMLDivElement,
  state: SetBuilderState,
  sheetPresets: SheetPreset[],
  customSheetWidthMm: number,
  customSheetHeightMm: number,
  toastText: string,
  lastEngineResult: NestingResult | null,
  dxfThumbCache: Map<string, string>,
  authSessionToken: string,
  authWorkspaceId: string,
): void {
  const filtered = getVisibleLibraryItems(state);
  const setRows = getSetRows(state);
  const totals = getTotals(state);
  const issues = getAggregatedIssues(state);
  const unnamedCatalogName = t('setBuilder.unnamedCatalog');
  const commonLineActive = lastEngineResult?.gap === 0;
  const sharedCutLen = lastEngineResult?.sharedCutLength ?? 0;
  const pierceDelta = lastEngineResult?.pierceDelta ?? 0;
  const showResultsInMain = state.activeTab === 'results';

  const tableHead = `
    <div class="sb-table-head">
      <div></div><div></div>
      <button class="sb-th" data-a="sort-col" data-sort="name">${t('setBuilder.name')}${sortMark(state, 'name')}</button>
      <div>${t('setBuilder.qty')}</div>
      <button class="sb-th" data-a="sort-col" data-sort="area">W×H${sortMark(state, 'area')}</button>
      <button class="sb-th" data-a="sort-col" data-sort="pierces">${t('setBuilder.pierces')}${sortMark(state, 'pierces')}</button>
      <button class="sb-th" data-a="sort-col" data-sort="cutLen">${t('setBuilder.cutLength')}${sortMark(state, 'cutLen')}</button>
      <div>${t('setBuilder.actions')}</div>
    </div>
  `;

  const groupedCatalogContent = (() => {
    const groups = new Map<string, LibraryItem[]>();
    for (const item of filtered) {
      const list = groups.get(item.catalog);
      if (list) list.push(item);
      else groups.set(item.catalog, [item]);
    }

    const allCatalogNames = new Set<string>();
    for (const c of workspaceCatalogs) allCatalogNames.add(c.name);
    for (const item of state.library) allCatalogNames.add(item.catalog);
    allCatalogNames.add(unnamedCatalogName);

    const orderedCatalogs = [
      ...workspaceCatalogs.map((c) => c.name),
      unnamedCatalogName,
      ...[...allCatalogNames].filter((name) => name !== unnamedCatalogName && !workspaceCatalogs.some((c) => c.name === name)),
    ];

    return orderedCatalogs
      .map((catalogName) => {
        const items = groups.get(catalogName) ?? [];
        const canManageCatalog = catalogName !== unnamedCatalogName && workspaceCatalogs.some((c) => c.name === catalogName);
        return `
          <section class="sb-catalog-group">
            <div class="sb-catalog-group-head" data-a="catalog-drop" data-catalog="${esc(catalogName)}">
              <div class="sb-catalog-group-meta">
                <span class="sb-catalog-folder-icon">📁</span><span class="sb-catalog-group-name">${esc(catalogName)}</span>
                <span class="sb-catalog-group-count">${items.length}</span>
              </div>
              ${canManageCatalog ? `
                <div class="sb-catalog-group-actions">
                  <button class="sb-icon" data-a="catalog-rename" data-catalog="${esc(catalogName)}" title="${t('setBuilder.catalogRename')}">✎</button>
                  <button class="sb-icon" data-a="catalog-delete" data-catalog="${esc(catalogName)}" title="${t('setBuilder.catalogDelete')}">🗑</button>
                </div>
              ` : ''}
            </div>
            <div class="sb-catalog-group-body sb-library--table">
              ${items.length === 0
                ? `<div class="sb-catalog-empty">${t('setBuilder.empty.noItems')}</div>`
                : items.map((item) => buildLibraryRow(item, state, dxfThumbCache)).join('')}
            </div>
          </section>
        `;
      })
      .join('');
  })();

  const selectedCount = state.selectedLibraryIds.size;
  const runDisabled = canRunNesting(state) ? '' : 'disabled';
  const authActive = authSessionToken.length > 0;
  const localeLabel = getLocale().toUpperCase();
  const authWorkspaceLabel = authActive
    ? `WS: ${authWorkspaceId.length > 12 ? authWorkspaceId.slice(0, 12) + '…' : authWorkspaceId}`
    : t('toolbar.guest');

  root.innerHTML = `
    <div class="sb-shell">
      <div class="sb-topbar">
        <span class="sb-auth-pill" title="${esc(authWorkspaceLabel)}">${esc(authWorkspaceLabel)}</span>
        <button class="sb-btn sb-btn--ghost" data-a="lang-toggle">${localeLabel}</button>
        <button class="sb-btn sb-btn--ghost" data-a="tg-login">${authActive ? t('auth.changeAccount') : t('toolbar.login')}</button>
        ${authActive ? `<button class="sb-btn sb-btn--ghost" data-a="tg-logout">${t('toolbar.logout')}</button>` : ''}
        <button class="sb-btn sb-btn--ghost" data-a="close">${t('setBuilder.close')}</button>
      </div>

      <div class="sb-main">
        <div class="sb-left">
          <div class="sb-list-toolbar">
            <div class="sb-tabs">
              <button class="${state.activeTab === 'library' ? 'active' : ''}" data-a="tab" data-tab="library">${t('setBuilder.tabLibrary')}</button>
              <button class="${state.activeTab === 'results' ? 'active' : ''}" data-a="tab" data-tab="results">${t('setBuilder.tabResults')}</button>
            </div>
            ${showResultsInMain ? '' : `
              <div class="sb-list-toolbar-main">
                <button class="sb-btn" data-a="upload">${t('setBuilder.upload')}</button>
                <input class="sb-input sb-input--search" data-a="search" id="sb-search" placeholder="${t('setBuilder.searchPlaceholder')}" value="${esc(state.search)}" />
                <button class="sb-btn sb-btn--ghost" data-a="catalog-add">${t('setBuilder.catalogAdd')}</button>
              </div>
              <select class="sb-select" data-a="sort-by" title="${t('setBuilder.sortBy')}">
                <option value="name" ${state.sortBy === 'name' ? 'selected' : ''}>${t('setBuilder.sortName')}</option>
                <option value="area" ${state.sortBy === 'area' ? 'selected' : ''}>${t('setBuilder.sortArea')}</option>
                <option value="pierces" ${state.sortBy === 'pierces' ? 'selected' : ''}>${t('setBuilder.sortPierces')}</option>
                <option value="cutLen" ${state.sortBy === 'cutLen' ? 'selected' : ''}>${t('setBuilder.sortCutLen')}</option>
              </select>
              <select class="sb-select" data-a="sort-dir" title="${t('setBuilder.sortDirection')}">
                <option value="asc" ${state.sortDir === 'asc' ? 'selected' : ''}>${t('setBuilder.asc')}</option>
                <option value="desc" ${state.sortDir === 'desc' ? 'selected' : ''}>${t('setBuilder.desc')}</option>
              </select>
            `}
          </div>
          ${!showResultsInMain && selectedCount > 0 ? `
            <div class="sb-bulk">
              <span>${selectedCount} ${t('setBuilder.selected')}</span>
              <button class="sb-btn" data-a="bulk-add">${t('setBuilder.bulkAdd')}</button>
              <button class="sb-btn" data-a="bulk-remove">${t('setBuilder.bulkRemove')}</button>
              <button class="sb-btn" data-a="bulk-qty">${t('setBuilder.bulkSetQty')}</button>
              <button class="sb-btn sb-btn--ghost" data-a="bulk-clear">${t('setBuilder.clear')}</button>
            </div>
          ` : ''}
          ${showResultsInMain ? `
            <div class="sb-library">
              <div class="sb-results">
                ${lastEngineResult ? `
                  <div class="sb-bulk">
                    <button class="sb-btn" data-a="export-all">${t('setBuilder.exportAllSheets')}</button>
                    <button class="sb-btn" data-a="copy-all-hashes">${t('setBuilder.copyAllHashes')}</button>
                  </div>
                  <div class="sb-totals">
                    <div><span>${t('setBuilder.placedRequired')}:</span><b>${lastEngineResult.totalPlaced} / ${lastEngineResult.totalRequired}</b></div>
                    <div><span>${t('setBuilder.avgUtilization')}:</span><b>${Math.round(lastEngineResult.avgFillPercent)}%</b></div>
                    <div><span>${t('setBuilder.cutLenEst')}:</span><b>${fmtLen(lastEngineResult.cutLengthEstimate)}</b></div>
                    <div><span>${t('setBuilder.pierces')}:</span><b>${lastEngineResult.pierceEstimate}</b></div>
                    ${commonLineActive ? `<div><span>${t('setBuilder.savedCut')}:</span><b>−${fmtLen(Math.max(0, sharedCutLen))}</b></div>` : ''}
                    ${commonLineActive ? `<div><span>${t('setBuilder.savedPierces')}:</span><b>−${Math.max(0, pierceDelta)}</b></div>` : ''}
                    ${totals.totalWeightKg !== null ? `<div><span>${t('setBuilder.totalWeight')}:</span><b>${formatWeightKg(totals.totalWeightKg)}</b></div>` : ''}
                  </div>
                ` : ''}
                ${!state.results
                  ? `<div class="sb-empty">${t('setBuilder.empty.runToSee')}</div>`
                  : `<div class="sb-sheets-grid">${state.results.sheets.map((sheet, index) => `
                    <div class="sb-sheet-card">
                      <div class="sb-sheet-head"><b>${sheet.id.toUpperCase()}</b><span>${sheet.utilization}%</span></div>
                      ${buildSheetPlacementsMarkup(sheet, dxfThumbCache)}
                      <div class="sb-sheet-meta">${sheet.partCount} ${t('setBuilder.parts')}</div>
                      <div class="sb-sheet-actions">
                        <button class="sb-btn" data-a="export-sheet" data-index="${index}">${t('setBuilder.exportDxf')}</button>
                        <button class="sb-btn" data-a="preview-sheet" data-sheet="${sheet.id}">${t('setBuilder.openPreview')}</button>
                      </div>
                      ${sheet.hash
                        ? `<code class="sb-hash-code" data-a="copy-hash" data-hash="${sheet.hash}" title="${t('setBuilder.copyHash')}">${sheet.hash}</code>`
                        : `<span class="sb-hash-code sb-hash-code--empty">—</span>`}
                    </div>
                  `).join('')}</div>`}
              </div>
            </div>
          ` : `
            <div class="sb-library">${tableHead}${groupedCatalogContent}</div>
          `}
        </div>

        <aside class="sb-right">
          <div class="sb-set-list">
            ${setRows.length === 0
              ? `<div class="sb-empty">${t('setBuilder.empty.set')}</div>`
              : setRows.map(({ item, set }) => {
                  const rowAssignment = getMaterialAssignment(state, item.id);
                  const rowMat = rowAssignment ? findMaterial(rowAssignment.materialId) : null;
                  const rowWeightStr = (rowMat && item.areaMm2 > 0)
                    ? formatWeightKg(calcWeightKg(item.areaMm2, rowMat.thicknessMm, rowMat.densityKgM3) * set.qty)
                    : null;
                  const rowMatLabel = rowAssignment ? formatMaterialLabel(rowAssignment.materialId) : null;
                  return `
                <div class="sb-set-row">
                  <div class="sb-set-head">
                    <div class="sb-set-thumb">${buildThumbMarkup(item, dxfThumbCache)}</div>
                    <div class="sb-set-meta">
                      <div class="sb-set-name">${esc(item.name)}</div>
                      ${rowMatLabel ? `<div class="sb-set-mat">${esc(rowMatLabel)}${rowWeightStr ? ` · <b>${esc(rowWeightStr)}</b>` : ''}</div>` : ''}
                    </div>
                  </div>
                  <div class="sb-set-controls">
                    <label><input type="checkbox" data-a="set-enabled" data-id="${item.id}" ${set.enabled ? 'checked' : ''}/> ${t('setBuilder.enabled')}</label>
                    <div class="sb-stepper">
                      <button data-a="qty-minus" data-id="${item.id}">-</button>
                      <span>${set.qty}</span>
                      <button data-a="qty-plus" data-id="${item.id}">+</button>
                    </div>
                    <button class="sb-icon" data-a="preview-lib" data-id="${item.id}" title="${t('setBuilder.openPreview')}">👁</button>
                    <button class="sb-icon" data-a="remove-set" data-id="${item.id}" title="${t('setBuilder.remove')}">🗑</button>
                  </div>
                </div>
              `;
                }).join('')}
          </div>
          <div class="sb-set-nest-panel">
            <div class="sb-nest-section">
              <div class="sb-nest-section-label">${t('setBuilder.settingsSheet')}</div>
              <div class="sb-preset-row">
                <select class="sb-select sb-select--preset" data-a="preset">
                  ${sheetPresets.map((p) => `<option value="${p.id}" ${state.sheetPresetId === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
                </select>
                <button class="sb-btn sb-btn--ghost sb-btn--xs sb-btn--icon" data-a="preset-rename" title="${t('setBuilder.renamePreset')}">✎</button>
                ${state.sheetPresetId.startsWith('custom_') ? `<button class="sb-btn sb-btn--ghost sb-btn--xs sb-btn--icon" data-a="preset-delete" title="${t('setBuilder.deletePreset')}">✕</button>` : ''}
              </div>
              <div class="sb-custom-sheet">
                <input class="sb-input sb-input--sm" type="number" min="1" data-a="sheet-custom-w" value="${customSheetWidthMm}" placeholder="W" title="${t('setBuilder.customSheetW')}" />
                <span>×</span>
                <input class="sb-input sb-input--sm" type="number" min="1" data-a="sheet-custom-h" value="${customSheetHeightMm}" placeholder="H" title="${t('setBuilder.customSheetH')}" />
                <button class="sb-btn sb-btn--ghost sb-btn--xs" data-a="sheet-custom-add">${t('setBuilder.addSheetSize')}</button>
              </div>
            </div>

            <div class="sb-nest-section">
              <div class="sb-nest-section-label">${t('setBuilder.settingsMode')}</div>
              <div class="sb-toggle">
                <button class="${state.mode === 'normal' ? 'active' : ''}" data-a="mode" data-mode="normal">${t('setBuilder.normal')}</button>
                <button class="${state.mode === 'commonLine' ? 'active' : ''}" data-a="mode" data-mode="commonLine">${t('setBuilder.commonLine')}</button>
              </div>
            </div>

            <div class="sb-nest-section">
              <div class="sb-nest-section-label">${t('setBuilder.settingsAlgo')}</div>
              <div class="sb-nest-row">
                <label class="sb-nest-row-label">${t('setBuilder.nestingStrategy')}</label>
                <div class="sb-nest-value">${t('setBuilder.strategyPrecise')}</div>
              </div>
              ${state.mode === 'normal' ? `
              <div class="sb-nest-row">
                <label class="sb-nest-row-label">${t('setBuilder.gapLabel')}</label>
                <input class="sb-input sb-input--sm" type="number" min="0" data-a="gap" value="${state.gapMm}" />
              </div>
              ` : ''}
              <div class="sb-nest-row">
                <label class="sb-nest-row-label">${t('setBuilder.rotate')}</label>
                <div class="sb-nest-row-controls">
                  <input type="checkbox" data-a="rotation" ${state.rotationEnabled ? 'checked' : ''}/>
                  <select class="sb-select sb-select--mini" data-a="rotation-step" title="${t('setBuilder.rotationStep')}" ${state.rotationEnabled ? '' : 'disabled'}>
                    <option value="1" ${state.rotationStepDeg === 1 ? 'selected' : ''}>1°</option>
                    <option value="2" ${state.rotationStepDeg === 2 ? 'selected' : ''}>2°</option>
                    <option value="5" ${state.rotationStepDeg === 5 ? 'selected' : ''}>5°</option>
                  </select>
                </div>
              </div>
              <div class="sb-nest-row">
                <label class="sb-nest-row-label">${t('setBuilder.multiStart')}</label>
                <input type="checkbox" data-a="multi-start" ${state.multiStart ? 'checked' : ''}/>
              </div>
              <div class="sb-nest-row">
                <label class="sb-nest-row-label">${t('setBuilder.seed')}</label>
                <input class="sb-input sb-input--sm" type="number" step="1" data-a="seed" value="${state.seed}" />
              </div>
            </div>

            ${state.loading ? `
            <div class="sb-run-progress">
              <div class="sb-run-progress-bar">
                <div class="sb-run-progress-fill sb-run-progress-fill--${state.nestingPhase}"></div>
              </div>
              <div class="sb-run-progress-label">
                <span class="sb-run-spinner"></span>
                <span>${state.nestingPhase === 'preparing' ? t('setBuilder.phase.preparing') : state.nestingPhase === 'nesting' ? t('setBuilder.phase.nesting') : t('setBuilder.phase.saving')}</span>
              </div>
            </div>
            ` : ''}
            <button class="sb-btn sb-btn--primary sb-btn--run" data-a="run" ${runDisabled}>${t('setBuilder.runNesting')}</button>
          </div>
          <div class="sb-totals">
            <div><span>${t('setBuilder.enabledParts')}:</span><b>${totals.enabledParts}</b></div>
            <div><span>${t('setBuilder.totalQty')}:</span><b>${totals.qtySum}</b></div>
            <div><span>${t('setBuilder.totalPierces')}:</span><b>${totals.piercesSum}</b></div>
            <div><span>${t('setBuilder.totalCutLen')}:</span><b>${fmtLen(totals.cutLenSum)}</b></div>
            ${totals.totalWeightKg !== null ? `<div><span>${t('setBuilder.totalWeight')}:</span><b>${formatWeightKg(totals.totalWeightKg)}</b></div>` : ''}
          </div>
          <div class="sb-issues">
            <div class="sb-issues-title">${t('setBuilder.issues.title')}</div>
            ${issues.length === 0 ? `<div class="sb-empty">${t('setBuilder.empty.noIssues')}</div>` : issues.map((it) => `<div>${esc(it.issue)} <b>×${it.count}</b></div>`).join('')}
          </div>
          <button class="sb-btn sb-btn--ghost" data-a="clear-set">${t('setBuilder.clearSet')}</button>
        </aside>
      </div>

      ${toastText ? `<div class="sb-toast">${esc(toastText)}</div>` : ''}
      ${renderPreviewModal(state, dxfThumbCache)}
      ${renderMaterialModal(state)}
    </div>
  `;
}
