import { runDiagnostics } from './diagnostics.js';
import { runOptimizationPipeline } from './rules.js';
import { serializeEntitiesToDxfBytesAsync } from './dxf-writer.js';
import type { OptimizerInput, OptimizationResult, OptimizerState } from './types.js';

export { createOptimizerState } from './types.js';
export type { OptimizerState, OptimizerTab, OptimizerPhase } from './types.js';

export async function analyzeFile(
  input: OptimizerInput,
  oState: OptimizerState,
  render: () => void,
): Promise<void> {
  oState.running = true;
  oState.phase = 'analyzing';
  oState.diagnostics = null;
  oState.result = null;
  render();

  // Async yield to let UI update before heavy computation
  await new Promise<void>((r) => setTimeout(r, 0));

  try {
    oState.diagnostics = runDiagnostics(input.flatEntities);
    oState.activeTab = 'overview';
  } finally {
    oState.running = false;
    oState.phase = 'idle';
    render();
  }
}

export async function optimizeFile(
  input: OptimizerInput,
  oState: OptimizerState,
  render: () => void,
): Promise<void> {
  if (oState.running) return;
  oState.running = true;
  oState.phase = 'optimizing';
  render();

  // Two rAF ticks: first lets render() flush to DOM, second lets browser paint
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    const beforeEntities = input.flatEntities.length;
    const pipelineResult = runOptimizationPipeline(input.flatEntities, oState.plan);
    const afterEntities = pipelineResult.entities.length;

    const report = {
      fileName: input.fileName,
      parameters: { epsilonMm: oState.plan.epsilonMm, rules: [...oState.plan.enabled] },
      before: {
        totalEntities: beforeEntities,
      },
      after: {
        totalEntities: afterEntities,
      },
      rulesApplied: pipelineResult.rulesApplied,
      issues: oState.diagnostics?.issues ?? [],
    };

    oState.result = {
      beforeEntities,
      afterEntities,
      rulesApplied: pipelineResult.rulesApplied,
      optimizedEntities: pipelineResult.entities,
      reportJson: JSON.stringify(report, null, 2),
      fileName: input.fileName,
    } satisfies OptimizationResult;

    oState.phase = 'done';
    oState.activeTab = 'optimize';
  } finally {
    oState.running = false;
    render();
  }
}

export async function downloadOptimizedDxf(result: OptimizationResult): Promise<void> {
  const baseName = result.fileName.replace(/\.dxf$/i, '');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const dxfBytes = await serializeEntitiesToDxfBytesAsync(result.optimizedEntities);
  const blob = new Blob([dxfBytes], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}_optimized.dxf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadReportJson(result: OptimizationResult): void {
  const baseName = result.fileName.replace(/\.dxf$/i, '');
  const blob = new Blob([result.reportJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}_report.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
