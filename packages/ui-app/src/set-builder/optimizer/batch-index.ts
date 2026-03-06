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
      optimizedEntities: null,
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

      entry.afterEntities = after;
      entry.savedEntities = before - after;
      entry.optimizedEntities = pipelineResult.entities;
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

// ─── Minimal ZIP builder (no dependencies) ────────────────────────────────────

function u16le(n: number): number[] { return [n & 0xff, (n >> 8) & 0xff]; }
function u32le(n: number): number[] { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]; }

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = crc32.table ??= (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
crc32.table = null as null | Uint32Array;

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralDirs: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header
    const local = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,     // signature
      ...u16le(20),                 // version needed
      ...u16le(0),                  // flags
      ...u16le(0),                  // compression (stored)
      ...u16le(0), ...u16le(0),    // mod time, mod date
      ...u32le(crc),
      ...u32le(size),
      ...u32le(size),
      ...u16le(nameBytes.length),
      ...u16le(0),                  // extra length
      ...nameBytes,
    ]);

    // Central directory entry
    const central = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,     // signature
      ...u16le(20), ...u16le(20),  // version made, needed
      ...u16le(0),                  // flags
      ...u16le(0),                  // compression (stored)
      ...u16le(0), ...u16le(0),    // mod time, mod date
      ...u32le(crc),
      ...u32le(size),
      ...u32le(size),
      ...u16le(nameBytes.length),
      ...u16le(0),                  // extra length
      ...u16le(0),                  // comment length
      ...u16le(0),                  // disk start
      ...u16le(0),                  // int attr
      ...u32le(0),                  // ext attr
      ...u32le(offset),             // local header offset
      ...nameBytes,
    ]);

    localHeaders.push(local);
    localHeaders.push(file.data);
    centralDirs.push(central);
    offset += local.length + size;
  }

  const centralStart = offset;
  const centralSize = centralDirs.reduce((s, d) => s + d.length, 0);

  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,         // signature
    ...u16le(0),                      // disk number
    ...u16le(0),                      // central dir disk
    ...u16le(files.length),
    ...u16le(files.length),
    ...u32le(centralSize),
    ...u32le(centralStart),
    ...u16le(0),                      // comment length
  ]);

  const parts = [...localHeaders, ...centralDirs, eocd];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

// ─── Download all results as ZIP archive ──────────────────────────────────────

export async function downloadBatchZip(bState: BatchOptimizerState): Promise<void> {
  const doneEntries = bState.entries.filter((e) => e.status === 'done' && e.optimizedEntities);
  if (doneEntries.length === 0) return;

  const enc = new TextEncoder();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < doneEntries.length; i++) {
    const entry = doneEntries[i]!;
    files.push({
      name: entry.name.replace(/\.dxf$/i, '') + '_optimized.dxf',
      data: enc.encode(serializeEntitiesToDxf(entry.optimizedEntities!)),
    });
    if ((i + 1) % 2 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const zipBytes = buildZip(files);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'optimized_batch.zip';
  a.click();
  await new Promise<void>((r) => setTimeout(r, 200));
  URL.revokeObjectURL(url);
}
