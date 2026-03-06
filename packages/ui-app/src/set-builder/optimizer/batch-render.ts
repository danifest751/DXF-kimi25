import { t } from '../../i18n/index.js';
import { esc } from '../utils.js';
import type { BatchOptimizerState, BatchFileEntry } from './batch-types.js';
import { OPTIMIZATION_RULES } from './types.js';
import { iconClose, iconCheck, iconDash, iconLightning } from '../icons.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusIcon(entry: BatchFileEntry): string {
  switch (entry.status) {
    case 'pending':   return '<span class="batch-status batch-status--pending">—</span>';
    case 'analyzing': return '<span class="batch-status batch-status--spin"><span class="sb-run-spinner"></span></span>';
    case 'queued':    return '<span class="batch-status batch-status--pending">…</span>';
    case 'running':   return '<span class="batch-status batch-status--spin"><span class="sb-run-spinner"></span></span>';
    case 'done':      return `<span class="batch-status batch-status--done">${iconCheck}</span>`;
    case 'skipped':   return `<span class="batch-status batch-status--skip">${iconDash}</span>`;
    case 'error':     return `<span class="batch-status batch-status--error" title="${esc(entry.error ?? '')}">${iconClose}</span>`;
  }
}

function renderDelta(entry: BatchFileEntry): string {
  if (entry.beforeEntities === null) return '<span class="batch-dim">—</span>';
  const before = entry.beforeEntities;
  const after = entry.afterEntities;
  if (after === null) return `<span>${before}</span> <span class="batch-dim">→ ?</span>`;
  const delta = before - after;
  const deltaStr = delta > 0
    ? `<span class="batch-saved">−${delta}</span>`
    : `<span class="batch-dim">±0</span>`;
  return `<span>${before}</span> → <b>${after}</b> ${deltaStr}`;
}

function renderFileRow(entry: BatchFileEntry): string {
  const isRunning = entry.status === 'running' || entry.status === 'analyzing';
  return `
    <tr class="batch-row${!entry.enabled ? ' batch-row--disabled' : ''}${isRunning ? ' batch-row--active' : ''}">
      <td class="batch-cell-check">
        <input type="checkbox" class="batch-file-check" data-a="batch-toggle-file"
          data-id="${entry.libraryId}" ${entry.enabled ? 'checked' : ''}
          ${isRunning ? 'disabled' : ''} />
      </td>
      <td class="batch-cell-name" title="${esc(entry.name)}">${esc(entry.name)}</td>
      <td class="batch-cell-catalog batch-dim">${esc(entry.catalog)}</td>
      <td class="batch-cell-size batch-dim">${fmtSize(entry.fileSizeBytes)}</td>
      <td class="batch-cell-entities">${renderDelta(entry)}</td>
      <td class="batch-cell-status">${statusIcon(entry)}</td>
    </tr>
  `;
}

// ─── Main render ──────────────────────────────────────────────────────────────

export function renderBatchModal(bState: BatchOptimizerState): string {
  const { entries, phase, processedCount, totalCount, plan } = bState;

  const enabledCount = entries.filter((e) => e.enabled).length;
  const doneCount = entries.filter((e) => e.status === 'done').length;
  const savedTotal = entries.reduce((s, e) => s + (e.savedEntities ?? 0), 0);
  const isRunning = phase === 'running' || phase === 'analyzing';
  const isDone = phase === 'done';
  const canRun = enabledCount > 0 && !isRunning;
  const hasResults = entries.some((e) => e.status === 'done' && e.optimizedEntities);

  const progressPct = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  const catalogTitle = bState.allCatalogs
    ? t('batch.allCatalogs')
    : (bState.catalogName ?? '');

  return `
    <div class="sb-modal-backdrop sb-modal-backdrop--batch" data-a="batch-backdrop">
      <div class="sb-modal sb-modal--batch" role="dialog" aria-modal="true">

        <div class="sb-modal-head batch-modal-head">
          <div class="batch-modal-title">
            <span class="batch-modal-icon">${iconLightning}</span>
            <div>
              <div class="batch-modal-name">${t('batch.title')}</div>
              <div class="batch-modal-catalog">${esc(catalogTitle)}</div>
            </div>
          </div>
          <button class="sb-icon" data-a="batch-close" title="${t('optimizer.close')}">${iconClose}</button>
        </div>

        <div class="batch-body">

          <div class="batch-options-row">
            <label class="batch-check-label">
              <input type="checkbox" data-a="batch-all-catalogs" ${bState.allCatalogs ? 'checked' : ''} ${isRunning ? 'disabled' : ''} />
              ${t('batch.optimizeAll')}
            </label>

            <div class="batch-rules-row">
              ${OPTIMIZATION_RULES.map((rule) => `
                <label class="batch-rule-chip ${plan.enabled.has(rule.id) ? 'active' : ''}" title="${t(rule.descKey as Parameters<typeof t>[0])}">
                  <input type="checkbox" data-a="batch-rule" data-rule="${rule.id}"
                    ${plan.enabled.has(rule.id) ? 'checked' : ''} ${isRunning ? 'disabled' : ''} />
                  ${rule.id}
                </label>
              `).join('')}
              <label class="batch-epsilon-label">
                ε
                <input class="sb-input sb-input--sm batch-epsilon" type="number"
                  min="0.001" max="1" step="0.001" data-a="batch-epsilon"
                  value="${plan.epsilonMm}" ${isRunning ? 'disabled' : ''} />
                мм
              </label>
            </div>
          </div>

          <div class="batch-table-wrap">
            <table class="batch-table">
              <thead>
                <tr>
                  <th class="batch-cell-check">
                    <input type="checkbox" data-a="batch-toggle-all"
                      ${enabledCount === entries.length && entries.length > 0 ? 'checked' : ''}
                      ${isRunning ? 'disabled' : ''} />
                  </th>
                  <th>${t('batch.col.name')}</th>
                  <th>${t('batch.col.catalog')}</th>
                  <th>${t('batch.col.size')}</th>
                  <th>${t('batch.col.entities')}</th>
                  <th>${t('batch.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                ${entries.length === 0
                  ? `<tr><td colspan="6" class="batch-empty">${t('batch.noFiles')}</td></tr>`
                  : entries.map(renderFileRow).join('')}
              </tbody>
            </table>
          </div>

          ${isRunning || isDone ? `
            <div class="batch-progress-wrap">
              <div class="batch-progress-bar">
                <div class="batch-progress-fill" style="width:${progressPct}%"></div>
              </div>
              <div class="batch-progress-label">
                <span>${processedCount} / ${totalCount} ${t('batch.files')}</span>
                <span>${progressPct}%</span>
                ${isDone && savedTotal > 0 ? `<span class="batch-saved-total">−${savedTotal} ${t('batch.entities')}</span>` : ''}
              </div>
            </div>
          ` : ''}

          ${isDone ? `
            <div class="batch-summary">
              <span class="batch-summary-done">${iconCheck} ${doneCount} ${t('batch.doneCount')}</span>
              ${savedTotal > 0 ? `<span class="batch-saved-total">−${savedTotal} ${t('batch.savedEntities')}</span>` : ''}
            </div>
          ` : ''}

        </div>

        <div class="batch-footer">
          ${hasResults ? `
            <button class="sb-btn sb-btn--ghost" data-a="batch-download-zip">
              ⬇ ${t('batch.downloadZip')}
            </button>
          ` : '<div></div>'}
          <div class="batch-footer-right">
            <button class="sb-btn sb-btn--ghost" data-a="batch-close">${t('batch.cancel')}</button>
            ${isRunning
              ? `<button class="sb-btn sb-btn--danger" data-a="batch-abort">${t('batch.abort')}</button>`
              : `<button class="sb-btn sb-btn--primary" data-a="batch-run" ${!canRun ? 'disabled' : ''}>
                  ⚡ ${t('batch.run')} ${enabledCount > 0 ? `(${enabledCount})` : ''}
                </button>`
            }
          </div>
        </div>

      </div>
    </div>
  `;
}
