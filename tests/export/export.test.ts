import { describe, it, expect } from 'vitest';
import {
  exportResults,
  exportNestingToDXF,
  exportNestingToCSV,
  exportCuttingStatsToCSV,
} from '../../packages/core-engine/src/export/index.js';
import type { NestingResult, NestingSheet, PlacedItem, SheetSize } from '../../packages/core-engine/src/nesting/index.js';
import type { CuttingStats } from '../../packages/core-engine/src/cutting/index.js';

// ─── Вспомогательные функции ────────────────────────────────────────

function makeNestingResult(
  sheets: Partial<NestingSheet>[],
  sheetSize: SheetSize = { width: 1000, height: 2000 },
  gap: number = 5
): NestingResult {
  const fullSheets: NestingSheet[] = sheets.map((s, i) => ({
    sheetIndex: i,
    placed: (s.placed as Partial<PlacedItem>[])?.map((p, j) => ({
      itemId: p.itemId ?? 1,
      name: p.name ?? 'Part',
      x: p.x ?? 0,
      y: p.y ?? 0,
      width: p.width ?? 100,
      height: p.height ?? 100,
      rotated: p.rotated ?? false,
      angleDeg: (p as any).angleDeg ?? 0,
      copyIndex: p.copyIndex ?? 0,
    })) ?? [],
    usedArea: s.usedArea ?? 0,
    fillPercent: s.fillPercent ?? 0,
  }));

  const totalPlaced = fullSheets.reduce((sum, s) => sum + s.placed.length, 0);

  return {
    sheet: sheetSize,
    gap,
    sheets: fullSheets,
    totalSheets: fullSheets.length,
    totalPlaced,
    totalRequired: totalPlaced,
    avgFillPercent: fullSheets.length > 0
      ? fullSheets.reduce((sum, s) => sum + s.fillPercent, 0) / fullSheets.length
      : 0,
    cutLengthEstimate: 0,
    sharedCutLength: 0,
    cutLengthAfterMerge: 0,
    pierceEstimate: totalPlaced,
    pierceDelta: 0,
  };
}

function makeCuttingStats(): CuttingStats {
  return {
    totalPierces: 10,
    totalCutLength: 5000,
    cuttingEntityCount: 20,
    chains: [
      {
        chainIndex: 0,
        entityIndices: [0, 1, 2],
        cutLength: 1500,
        isClosed: true,
        layer: 'Layer1',
        piercePoint: { x: 0, y: 0, z: 0 },
      },
      {
        chainIndex: 1,
        entityIndices: [3, 4],
        cutLength: 1000,
        isClosed: false,
        layer: 'Layer2',
        piercePoint: { x: 100, y: 100, z: 0 },
      },
    ],
    byLayer: [
      {
        layerName: 'Layer1',
        pierces: 5,
        cutLength: 3000,
        entityCount: 12,
      },
      {
        layerName: 'Layer2',
        pierces: 5,
        cutLength: 2000,
        entityCount: 8,
      },
    ],
  };
}

// ─── Тесты exportNestingToDXF ───────────────────────────────────────

describe('exportNestingToDXF', () => {
  it('экспортирует раскладку в DXF формат', () => {
    const nestingResult = makeNestingResult([
      {
        placed: [
          { itemId: 1, name: 'Part1', x: 0, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 },
        ],
        usedArea: 10000,
        fillPercent: 25,
      },
    ]);

    const dxf = exportNestingToDXF({ nestingResult, fileName: 'test' });

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('EOF');
  });

  it('создаёт DXF с правильными слоями', () => {
    const nestingResult = makeNestingResult([
      {
        placed: [
          { itemId: 1, name: 'Part1', x: 0, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 },
        ],
      },
    ]);

    const dxf = exportNestingToDXF({ nestingResult });

    expect(dxf).toContain('LAYER');
    expect(dxf).toContain('0');
    expect(dxf).toContain('SHEET');
    expect(dxf).toMatch(/TABLE\n2\nLAYER[\s\S]*\n2\nPart1\n/);
  });

  it('экспортирует несколько листов', () => {
    const nestingResult = makeNestingResult([
      {
        placed: [{ itemId: 1, name: 'Part1', x: 0, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 }],
        usedArea: 10000,
        fillPercent: 25,
      },
      {
        placed: [{ itemId: 2, name: 'Part2', x: 200, y: 200, width: 150, height: 150, rotated: false, copyIndex: 0 }],
        usedArea: 22500,
        fillPercent: 50,
      },
    ]);

    const dxf = exportNestingToDXF({ nestingResult });

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    // Должно быть больше сущностей для двух листов
    const lineCount = (dxf.match(/LINE/g) || []).length;
    expect(lineCount).toBeGreaterThan(4);
  });
});

// ─── Тесты exportNestingToCSV ───────────────────────────────────────

describe('exportNestingToCSV', () => {
  it('экспортирует раскладку в CSV формат', () => {
    const nestingResult = makeNestingResult([
      {
        placed: [
          { itemId: 1, name: 'Part1', x: 0, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 },
        ],
        usedArea: 10000,
        fillPercent: 25,
      },
    ]);

    const csv = exportNestingToCSV({ nestingResult, fileName: 'test' });

    expect(csv).toContain('# test');
    expect(csv).toContain('Nesting Summary');
    expect(csv).toContain('Sheet Details');
    expect(csv).toContain('Placed Items');
  });

  it('содержит правильную сводку', () => {
    const nestingResult = makeNestingResult(
      [
        {
          placed: [
            { itemId: 1, name: 'Part1', x: 0, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 },
            { itemId: 2, name: 'Part2', x: 100, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 },
          ],
          usedArea: 20000,
          fillPercent: 50,
        },
      ],
      { width: 1000, height: 1000 },
      5
    );

    const csv = exportNestingToCSV({ nestingResult });

    expect(csv).toContain('1000 x 1000');
    expect(csv).toContain('5 mm');
    expect(csv).toContain('Total Sheets,1');
    expect(csv).toContain('Total Placed,2');
    expect(csv).toContain('Average Fill,50.0%');
  });

  it('содержит детали размещённых объектов', () => {
    const nestingResult = makeNestingResult([
      {
        placed: [
          { itemId: 1, name: 'Part1', x: 50.5, y: 100.25, width: 100, height: 100, rotated: true, copyIndex: 0 },
        ],
      },
    ]);

    const csv = exportNestingToCSV({ nestingResult });

    expect(csv).toContain('Part1');
    expect(csv).toContain('50.5');
    expect(csv).toContain('100.25');
    expect(csv).toContain('true');
  });

  it('содержит информацию по листам', () => {
    const nestingResult = makeNestingResult([
      { placed: [], usedArea: 50000, fillPercent: 25 },
      { placed: [], usedArea: 75000, fillPercent: 37.5 },
    ]);

    const csv = exportNestingToCSV({ nestingResult });

    expect(csv).toContain('Sheet Index,Placed Count,Used Area');
    expect(csv).toContain('0,0,50000.00,25.0');
    expect(csv).toContain('1,0,75000.00,37.5');
  });
});

// ─── Тесты exportCuttingStatsToCSV ──────────────────────────────────

describe('exportCuttingStatsToCSV', () => {
  it('экспортирует статистику резки в CSV формат', () => {
    const stats = makeCuttingStats();

    const csv = exportCuttingStatsToCSV({ stats, fileName: 'cutting' });

    expect(csv).toContain('# cutting');
    expect(csv).toContain('General Statistics');
    expect(csv).toContain('Layer Statistics');
    expect(csv).toContain('Chain Details');
  });

  it('содержит правильную общую статистику', () => {
    const stats = makeCuttingStats();

    const csv = exportCuttingStatsToCSV({ stats });

    expect(csv).toContain('Total Pierces,10,pcs');
    expect(csv).toContain('Total Cut Length,5000.00,mm');
    expect(csv).toContain('Total Cut Length,5.00,m');
    expect(csv).toContain('Entity Count,20,pcs');
    expect(csv).toContain('Chain Count,2,pcs');
  });

  it('содержит статистику по слоям', () => {
    const stats = makeCuttingStats();

    const csv = exportCuttingStatsToCSV({ stats });

    expect(csv).toContain('Layer,Pierces,Cut Length (mm),Entity Count');
    expect(csv).toContain('Layer1,5,3000.00,12');
    expect(csv).toContain('Layer2,5,2000.00,8');
  });

  it('содержит детали цепочек', () => {
    const stats = makeCuttingStats();

    const csv = exportCuttingStatsToCSV({ stats });

    expect(csv).toContain('Chain Index,Layer,Cut Length (mm),Is Closed,Pierce X,Pierce Y,Pierce Z');
    expect(csv).toContain('0,Layer1,1500.00,true,0.0000,0.0000,0.0000');
    expect(csv).toContain('1,Layer2,1000.00,false,100.0000,100.0000,0.0000');
  });
});

// ─── Тесты exportResults ────────────────────────────────────────────

describe('exportResults', () => {
  it('экспортирует раскладку в DXF через общую функцию', () => {
    const nestingResult = makeNestingResult([
      { placed: [{ itemId: 1, name: 'Part1', x: 0, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 }] },
    ]);

    const result = exportResults({
      format: 'DXF',
      nestingResult,
      fileName: 'test',
    });

    expect(result).toContain('SECTION');
    expect(result).toContain('EOF');
  });

  it('экспортирует раскладку в CSV через общую функцию', () => {
    const nestingResult = makeNestingResult([
      { placed: [{ itemId: 1, name: 'Part1', x: 0, y: 0, width: 100, height: 100, rotated: false, copyIndex: 0 }] },
    ]);

    const result = exportResults({
      format: 'CSV',
      nestingResult,
      fileName: 'test',
    });

    expect(result).toContain('# test');
    expect(result).toContain('Nesting Summary');
  });

  it('экспортирует статистику резки в CSV через общую функцию', () => {
    const stats = makeCuttingStats();

    const result = exportResults({
      format: 'CSV',
      cuttingStats: stats,
      fileName: 'cutting',
    });

    expect(result).toContain('# cutting');
    expect(result).toContain('General Statistics');
  });

  it('выбрасывает ошибку при отсутствии nestingResult для DXF', () => {
    expect(() => {
      exportResults({
        format: 'DXF',
        fileName: 'test',
      });
    }).toThrow('Nesting result is required for DXF export');
  });

  it('выбрасывает ошибку при отсутствии данных для CSV', () => {
    expect(() => {
      exportResults({
        format: 'CSV',
        fileName: 'test',
      });
    }).toThrow('Either nestingResult or cuttingStats is required for CSV export');
  });

  it('выбрасывает ошибку для неподдерживаемого формата', () => {
    expect(() => {
      exportResults({
        format: 'PDF' as any,
        fileName: 'test',
      });
    }).toThrow('Unsupported export format: PDF');
  });
});

