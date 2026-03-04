import { t } from '../../i18n/index.js';
import { esc } from '../utils.js';
import type { OptimizerState } from './types.js';
import { OPTIMIZATION_RULES } from './types.js';

// ─── Score color ─────────────────────────────────────────────────────────────

function scoreClass(score: number): string {
  if (score >= 75) return 'opt-score--good';
  if (score >= 40) return 'opt-score--warn';
  return 'opt-score--bad';
}

function severityIcon(severity: string): string {
  if (severity === 'critical') return '🔴';
  if (severity === 'warning') return '🟡';
  return '🔵';
}

// ─── Tab: Overview ───────────────────────────────────────────────────────────

function renderOverview(oState: OptimizerState): string {
  const d = oState.diagnostics;
  if (!d) {
    return oState.running
      ? `<div class="opt-loading"><span class="sb-run-spinner"></span> ${t('optimizer.analyzing')}</div>`
      : `<div class="opt-empty">${t('optimizer.noData')}</div>`;
  }

  const critCount = d.issues.filter((i) => i.severity === 'critical').length;
  const warnCount = d.issues.filter((i) => i.severity === 'warning').length;
  const infoCount = d.issues.filter((i) => i.severity === 'info').length;

  return `
    <div class="opt-overview">
      <div class="opt-score-block">
        <div class="opt-score ${scoreClass(d.healthScore)}">${d.healthScore}</div>
        <div class="opt-score-label">Health Score</div>
        <div class="opt-score-badges">
          ${critCount > 0 ? `<span class="opt-badge opt-badge--critical">${critCount} critical</span>` : ''}
          ${warnCount > 0 ? `<span class="opt-badge opt-badge--warning">${warnCount} warning</span>` : ''}
          ${infoCount > 0 ? `<span class="opt-badge opt-badge--info">${infoCount} info</span>` : ''}
        </div>
      </div>
      <div class="opt-stats-grid">
        <div class="opt-stat"><span>${t('optimizer.stat.entities')}</span><b>${d.totalEntities}</b></div>
        <div class="opt-stat"><span>${t('optimizer.stat.vertices')}</span><b>${d.totalVertices}</b></div>
        <div class="opt-stat"><span>${t('optimizer.stat.layers')}</span><b>${d.layersCount}</b></div>
        <div class="opt-stat"><span>${t('optimizer.stat.extents')}</span><b>${d.extentW} × ${d.extentH} мм</b></div>
      </div>
      ${d.issues.length > 0 ? `
        <div class="opt-issues-summary">
          ${d.issues.slice(0, 3).map((issue) => `
            <div class="opt-issue-row opt-issue-row--${issue.severity}">
              <span>${severityIcon(issue.severity)}</span>
              <span>${esc(issue.message)}</span>
            </div>
          `).join('')}
          ${d.issues.length > 3 ? `<div class="opt-issue-more">${d.issues.length - 3} ${t('optimizer.moreIssues')}</div>` : ''}
        </div>
      ` : `<div class="opt-ok">${t('optimizer.noIssues')}</div>`}
      <div class="opt-overview-actions">
        <button class="sb-btn sb-btn--ghost" data-a="opt-tab" data-tab="preview">${t('optimizer.tab.preview')}</button>
        <button class="sb-btn sb-btn--primary opt-run-btn" data-a="opt-run"
          ${!d ? 'disabled' : ''}>${t('optimizer.runOptimize')}</button>
      </div>
    </div>
  `;
}

// ─── Tab: Preview ───────────────────────────────────────────────────────────

function renderPreview(oState: OptimizerState): string {
  const d = oState.diagnostics;
  if (!d) return `<div class="opt-empty">${t('optimizer.noData')}</div>`;

  const critCodes = new Set(oState.diagnostics?.issues
    .filter((i) => i.severity === 'critical')
    .map((i) => i.code) ?? []);
  const warnCodes = new Set(oState.diagnostics?.issues
    .filter((i) => i.severity === 'warning')
    .map((i) => i.code) ?? []);

  const legend = [
    { cls: 'opt-legend-normal', label: t('optimizer.preview.normal') },
    { cls: 'opt-legend-warn', label: t('optimizer.preview.warning') },
    { cls: 'opt-legend-crit', label: t('optimizer.preview.critical') },
  ];

  return `
    <div class="opt-preview-wrap">
      <div class="opt-preview-legend">
        ${legend.map((l) => `<span class="opt-legend-item"><i class="${l.cls}"></i>${esc(l.label)}</span>`).join('')}
      </div>
      <div class="opt-preview-canvas-wrap">
        <canvas class="opt-preview-canvas" data-a="opt-preview-canvas"
          data-crit="${esc(JSON.stringify([...critCodes]))}"
          data-warn="${esc(JSON.stringify([...warnCodes]))}"
          width="800" height="600"></canvas>
      </div>
      <div class="opt-preview-info">
        <span>${t('optimizer.stat.entities')}: <b>${d.totalEntities}</b></span>
        <span>${t('optimizer.stat.extents')}: <b>${d.extentW} × ${d.extentH} мм</b></span>
        ${oState.result ? `<span class="opt-preview-after">${t('optimizer.after')}: <b>${oState.result.afterEntities}</b></span>` : ''}
      </div>
    </div>
  `;
}

// ─── Tab: Inventory ──────────────────────────────────────────────────────────

function renderInventory(oState: OptimizerState): string {
  const d = oState.diagnostics;
  if (!d) return `<div class="opt-empty">${t('optimizer.noData')}</div>`;

  return `
    <div class="opt-inventory">
      <div class="opt-section-title">${t('optimizer.entityTypes')}</div>
      <table class="opt-table">
        <thead><tr><th>${t('optimizer.col.type')}</th><th>${t('optimizer.col.count')}</th><th>%</th></tr></thead>
        <tbody>
          ${d.entityTypes.map((et) => `
            <tr>
              <td class="opt-td-type">${esc(et.type)}</td>
              <td>${et.count}</td>
              <td>
                <div class="opt-bar-wrap">
                  <div class="opt-bar" style="width:${et.percent}%"></div>
                  <span>${et.percent}%</span>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="opt-section-title" style="margin-top:12px">${t('optimizer.layers')}</div>
      <table class="opt-table">
        <thead><tr><th>${t('optimizer.col.layer')}</th><th>${t('optimizer.col.count')}</th><th>${t('optimizer.col.types')}</th></tr></thead>
        <tbody>
          ${d.layers.map((l) => `
            <tr>
              <td>${esc(l.name)}</td>
              <td>${l.count}</td>
              <td class="opt-td-types">${l.types.slice(0, 5).map(esc).join(', ')}${l.types.length > 5 ? '…' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Tab: Issues ─────────────────────────────────────────────────────────────

function renderIssues(oState: OptimizerState): string {
  const d = oState.diagnostics;
  if (!d) return `<div class="opt-empty">${t('optimizer.noData')}</div>`;
  if (d.issues.length === 0) return `<div class="opt-ok">${t('optimizer.noIssues')}</div>`;

  const order: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info'];
  return `
    <div class="opt-issues-list">
      ${order.flatMap((sev) => {
        const group = d.issues.filter((i) => i.severity === sev);
        if (group.length === 0) return [];
        return [`
          <div class="opt-issues-group">
            <div class="opt-issues-group-title opt-issues-group-title--${sev}">
              ${severityIcon(sev)} ${sev.toUpperCase()}
            </div>
            ${group.map((issue) => `
              <div class="opt-issue-card opt-issue-card--${issue.severity}">
                <div class="opt-issue-head">
                  <span class="opt-issue-code">${esc(issue.code)}</span>
                  <span class="opt-issue-count">×${issue.count}</span>
                </div>
                <div class="opt-issue-msg">${esc(issue.message)}</div>
                ${issue.recommendation ? `<div class="opt-issue-rec">${esc(issue.recommendation)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `];
      }).join('')}
    </div>
  `;
}

// ─── Tab: Optimize ────────────────────────────────────────────────────────────

function renderOptimize(oState: OptimizerState): string {
  const result = oState.result;

  return `
    <div class="opt-optimize">
      <div class="opt-section-title">${t('optimizer.laserSafePreset')}
        <button class="sb-btn sb-btn--xs sb-btn--ghost" data-a="opt-preset-laser">${t('optimizer.applyPreset')}</button>
      </div>

      <div class="opt-rules">
        ${OPTIMIZATION_RULES.map((rule) => `
          <label class="opt-rule-row">
            <input type="checkbox" data-a="opt-rule" data-rule="${rule.id}" ${oState.plan.enabled.has(rule.id) ? 'checked' : ''} />
            <div class="opt-rule-info">
              <span class="opt-rule-name">${t(rule.nameKey as Parameters<typeof t>[0])}</span>
              <span class="opt-rule-desc">${t(rule.descKey as Parameters<typeof t>[0])}</span>
            </div>
            <span class="opt-rule-badge opt-rule-badge--safe">${t('optimizer.safe')}</span>
          </label>
        `).join('')}
      </div>

      <div class="opt-epsilon-row">
        <label class="opt-epsilon-label">${t('optimizer.epsilon')} (ε, мм)</label>
        <input class="sb-input sb-input--sm opt-epsilon-input" type="number" min="0.001" max="1" step="0.001"
          data-a="opt-epsilon" value="${oState.plan.epsilonMm}" />
      </div>

      ${oState.diagnostics ? `
        <div class="opt-preview-counts">
          <div class="opt-preview-count">
            <span>${t('optimizer.before')}</span>
            <b>${oState.diagnostics.totalEntities}</b>
          </div>
          <span class="opt-preview-arrow">→</span>
          <div class="opt-preview-count">
            <span>${t('optimizer.after')}</span>
            <b>${result ? result.afterEntities : '?'}</b>
          </div>
        </div>
      ` : ''}

      ${oState.running ? `
        <div class="opt-loading">
          <span class="sb-run-spinner"></span>
          <span>${t('optimizer.optimizing')}</span>
        </div>
      ` : `
        <button class="sb-btn sb-btn--primary opt-run-btn" data-a="opt-run"
          ${!oState.diagnostics ? 'disabled' : ''}>${t('optimizer.runOptimize')}</button>
      `}

      ${result ? `
        <div class="opt-result">
          <div class="opt-result-title">${t('optimizer.resultTitle')}</div>
          <div class="opt-result-diff">
            <span>${result.beforeEntities} ${t('optimizer.entities')}</span>
            <span class="opt-arrow">→</span>
            <span class="opt-result-after">${result.afterEntities} ${t('optimizer.entities')}</span>
            <span class="opt-result-delta">(−${result.beforeEntities - result.afterEntities})</span>
          </div>
          ${result.rulesApplied.length > 0 ? `
            <div class="opt-rules-applied">
              ${result.rulesApplied.map((r) => `
                <div class="opt-rule-applied">
                  <span class="opt-rule-id">${r.ruleId}</span>
                  <span>${t('optimizer.affected')}: ${r.affected}</span>
                </div>
              `).join('')}
            </div>
          ` : `<div class="opt-no-changes">${t('optimizer.noChanges')}</div>`}
          <div class="opt-export-btns">
            <button class="sb-btn sb-btn--primary" data-a="opt-export-dxf">${t('optimizer.exportDxf')}</button>
            <button class="sb-btn sb-btn--ghost" data-a="opt-export-report">${t('optimizer.exportReport')}</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Main modal renderer ──────────────────────────────────────────────────────

export function renderOptimizerModal(
  oState: OptimizerState | null,
  libItemId: number | null,
  fileName: string,
): string {
  if (libItemId === null || oState === null) return '';

  const tabs: Array<{ id: string; label: string }> = [
    { id: 'overview', label: t('optimizer.tab.overview') },
    { id: 'preview', label: t('optimizer.tab.preview') },
    { id: 'inventory', label: t('optimizer.tab.inventory') },
    { id: 'issues', label: t('optimizer.tab.issues') },
    { id: 'optimize', label: t('optimizer.tab.optimize') },
  ];

  let tabContent = '';
  if (oState.activeTab === 'overview') tabContent = renderOverview(oState);
  else if (oState.activeTab === 'preview') tabContent = renderPreview(oState);
  else if (oState.activeTab === 'inventory') tabContent = renderInventory(oState);
  else if (oState.activeTab === 'issues') tabContent = renderIssues(oState);
  else tabContent = renderOptimize(oState);

  const d = oState.diagnostics;
  const issueCount = d ? d.issues.filter((i) => i.severity !== 'info').length : 0;

  return `
    <div class="sb-modal-backdrop sb-modal-backdrop--optimizer" data-a="opt-backdrop">
      <div class="sb-modal sb-modal--optimizer" role="dialog" aria-modal="true">
        <div class="sb-modal-head opt-modal-head">
          <div class="opt-modal-title">
            <span class="opt-modal-icon">🔧</span>
            <div>
              <div class="opt-modal-name">${t('optimizer.title')}</div>
              <div class="opt-modal-file">${esc(fileName)}</div>
            </div>
          </div>
          <button class="sb-icon" data-a="opt-close" title="${t('optimizer.close')}">✕</button>
        </div>

        <div class="opt-tabs">
          ${tabs.map((tab) => `
            <button class="opt-tab ${oState.activeTab === tab.id ? 'active' : ''}"
              data-a="opt-tab" data-tab="${tab.id}">
              ${tab.label}
              ${tab.id === 'issues' && issueCount > 0 ? `<span class="opt-tab-badge">${issueCount}</span>` : ''}
            </button>
          `).join('')}
        </div>

        <div class="opt-body">
          ${tabContent}
        </div>
      </div>
    </div>
  `;
}
