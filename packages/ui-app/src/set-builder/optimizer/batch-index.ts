import { runDiagnostics } from './diagnostics.js';
import { runOptimizationPipeline } from './rules.js';
import { serializeEntitiesToDxf } from './dxf-writer.js';
import type { BatchOptimizerState, BatchFileEntry } from './batch-types.js';
import { createDefaultPlan } from './batch-types.js';
import type { LibraryItem } from '../types.js';
import type { LoadedFile } from '../../state.js';

export { createDefaultPlan } from './batch-types.js';
export type { BatchOptimizerState, BatchFileEntry, BatchPhase } from './batch-types.js';
export { createBatchState } from './batch-types.js';

// ─── Build entries from library items ────────────────────────────────────────

export function buildBatchEntries(
  items: LibraryItem[],
  loadedFiles: LoadedFile[],
): BatchFileEntry[] {
  const entries: BatchFileEntry[] = [];
  for (const item of items) {
    if (item.sourceFileId === undefined) continue;
    const lf = loadedFiles.find((f) => f.id === item.sourceFileId);
    if (!lf || lf.loading || !lf.doc) continue;
    entries.push({
      libraryId: item.id,
      sourceFileId: item.sourceFileId,
      name: item.name,
      catalog: item.catalog,
      fileSizeBytes: lf.sizeBytes ?? (lf.localBase64 ? Math.round(lf.localBase64.length * 0.75) : 0),
      enabled: true,
      status: 'pending',
      beforeEntities: null,
      afterEntities: null,
      savedEntities: null,
      optimizedDxf: null,
      error: null,
    });
  }
  return entries;
}

// ─── Analyze all enabled entries ─────────────────────────────────────────────

export async function analyzeBatchEntries(
  bState: BatchOptimizerState,
  loadedFiles: LoadedFile[],
  render: () => void,
): Promise<void> {
  bState.phase = 'analyzing';
  bState.processedCount = 0;
  bState.totalCount = bState.entries.filter((e) => e.enabled).length;
  render();

  for (const entry of bState.entries) {
    if (bState.aborted) break;
    if (!entry.enabled) continue;
    entry.status = 'analyzing';
    render();

    await new Promise<void>((r) => setTimeout(r, 0));

    try {
      const lf = loadedFiles.find((f) => f.id === entry.sourceFileId);
      if (!lf || !lf.doc) throw new Error('File not loaded');
      const diag = runDiagnostics([...lf.doc.flatEntities]);
      entry.beforeEntities = diag.totalEntities;
      entry.status = 'queued';
    } catch (err) {
      entry.status = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
    }
    bState.processedCount++;
    render();
  }

  bState.phase = 'idle';
  render();
}

// ─── Run optimization for all enabled+queued entries ─────────────────────────

export async function runBatchOptimization(
  bState: BatchOptimizerState,
  loadedFiles: LoadedFile[],
  render: () => void,
): Promise<void> {
  bState.phase = 'running';
  bState.aborted = false;
  const toProcess = bState.entries.filter((e) => e.enabled && e.status !== 'error' && e.status !== 'skipped');
  bState.totalCount = toProcess.length;
  bState.processedCount = 0;
  render();

  for (const entry of toProcess) {
    if (bState.aborted) {
      entry.status = 'skipped';
      continue;
    }
    entry.status = 'running';
    render();

    await new Promise<void>((r) => setTimeout(r, 0));

    try {
      const lf = loadedFiles.find((f) => f.id === entry.sourceFileId);
      if (!lf || !lf.doc) throw new Error('File not loaded');

      const flatEntities = [...lf.doc.flatEntities];
      const before = flatEntities.length;
      entry.beforeEntities = before;

      const pipelineResult = runOptimizationPipeline(flatEntities, bState.plan);
      const after = pipelineResult.entities.length;
      const optimizedDxf = serializeEntitiesToDxf(pipelineResult.entities);

      entry.afterEntities = after;
      entry.savedEntities = before - after;
      entry.optimizedDxf = optimizedDxf;
      entry.status = 'done';
    } catch (err) {
      entry.status = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
    }

    bState.processedCount++;
    render();
  }

  bState.phase = 'done';
  render();
}

// ─── Download all results (sequential individual files) ───────────────────────

export async function downloadBatchZip(bState: BatchOptimizerState): Promise<void> {
  const doneEntries = bState.entries.filter((e) => e.status === 'done' && e.optimizedDxf);
  if (doneEntries.length === 0) return;

  for (const entry of doneEntries) {
    const baseName = entry.name.replace(/\.dxf$/i, '');
    const blob = new Blob([entry.optimizedDxf!], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_optimized.dxf`;
    a.click();
    await new Promise<void>((r) => setTimeout(r, 150));
    URL.revokeObjectURL(url);
  }
}
