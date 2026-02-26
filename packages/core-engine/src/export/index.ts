/**
 * @module core/export
 * Модуль экспорта результатов раскладки и статистики резки.
 * Поддерживаемые форматы: DXF, CSV
 */

import type { NestingResult } from '../nesting/index.js';
import type { CuttingStats } from '../cutting/index.js';
import { DXFEntityType, DXFFormat, DXFVersion } from '../types/index.js';
import type { DXFDocument, DXFEntity, DXFLayer, DXFLineEntity, DXFArcEntity, DXFCircleEntity, DXFLWPolylineEntity, BoundingBox } from '../types/index.js';
import type { FlattenedEntity } from '../normalize/index.js';
import { mat4TransformPoint } from '../geometry/index.js';

// ─── Экспорт в DXF ──────────────────────────────────────────────────

/** Данные исходного документа для одной детали */
export interface ItemDocData {
  readonly flatEntities: readonly FlattenedEntity[];
  readonly bbox: BoundingBox; // totalBBox of source document
}

/** Опции экспорта в DXF */
export interface ExportDXFOptions {
  readonly nestingResult: NestingResult;
  /** Map from itemId → source document data. When provided, real entities are exported instead of bboxes. */
  readonly itemDocs?: ReadonlyMap<number, ItemDocData>;
}

/**
 * Экспортирует раскладку в формат DXF.
 * @param options - Опции экспорта
 * @returns DXF файл в виде строки
 */
export function exportNestingToDXF(options: ExportDXFOptions): string {
  const { nestingResult } = options;
  
  const entities: DXFEntity[] = [];
  let handleCounter = 1000;

  const maxMergeDistanceMm = 0.2;
  const minSharedLenMm = 20;

  function overlapLength(a1: number, a2: number, b1: number, b2: number): number {
    const lo = Math.max(Math.min(a1, a2), Math.min(b1, b2));
    const hi = Math.min(Math.max(a1, a2), Math.max(b1, b2));
    return Math.max(0, hi - lo);
  }

  function createCommonLineSegments(
    placed: readonly { x: number; y: number; width: number; height: number }[],
  ): { x1: number; y1: number; x2: number; y2: number }[] {
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i]!;
      const aLeft = a.x;
      const aRight = a.x + a.width;
      const aBottom = a.y;
      const aTop = a.y + a.height;

      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j]!;
        const bLeft = b.x;
        const bRight = b.x + b.width;
        const bBottom = b.y;
        const bTop = b.y + b.height;

        const vertTouch = Math.min(Math.abs(aRight - bLeft), Math.abs(bRight - aLeft));
        if (vertTouch <= maxMergeDistanceMm) {
          const ov = overlapLength(aBottom, aTop, bBottom, bTop);
          if (ov >= minSharedLenMm) {
            const x = Math.abs(aRight - bLeft) <= Math.abs(bRight - aLeft) ? (aRight + bLeft) / 2 : (bRight + aLeft) / 2;
            const y1 = Math.max(aBottom, bBottom);
            const y2 = Math.min(aTop, bTop);
            segments.push({ x1: x, y1, x2: x, y2 });
          }
        }

        const horTouch = Math.min(Math.abs(aTop - bBottom), Math.abs(bTop - aBottom));
        if (horTouch <= maxMergeDistanceMm) {
          const ov = overlapLength(aLeft, aRight, bLeft, bRight);
          if (ov >= minSharedLenMm) {
            const y = Math.abs(aTop - bBottom) <= Math.abs(bTop - aBottom) ? (aTop + bBottom) / 2 : (bTop + aBottom) / 2;
            const x1 = Math.max(aLeft, bLeft);
            const x2 = Math.min(aRight, bRight);
            segments.push({ x1, y1: y, x2, y2: y });
          }
        }
      }
    }
    return segments;
  }

  const { itemDocs } = options;
  const sheetH = nestingResult.sheet.height;

  // Y-flip helper: nesting stores Y=0 at bottom (grows up), but visually
  // (in UI canvas) items appear at the top. Mirror Y within each sheet so
  // the exported DXF matches the on-screen layout (items at the top).
  function flipY(y: number, offsetY: number): number {
    return offsetY + (sheetH - y);
  }

  // Создаём сущности для каждого размещённого объекта
  for (const sheet of nestingResult.sheets) {
    const sheetOffsetY = sheet.sheetIndex * (sheetH + nestingResult.gap);
    for (const placed of sheet.placed) {
      const itemDoc = itemDocs?.get(placed.itemId);
      if (itemDoc) {
        // Draw real entities from source DXF, transformed to placement position
        const bb = itemDoc.bbox;
        const bbW = bb.max.x - bb.min.x;
        const bbH = bb.max.y - bb.min.y;
        const angleDeg = (placed as { angleDeg?: number }).angleDeg ?? (placed.rotated ? 90 : 0);
        const angleRad = (angleDeg * Math.PI) / 180;
        // For Y-flipped space, negate the rotation angle
        const cosA = Math.cos(-angleRad);
        const sinA = Math.sin(-angleRad);
        // Centre of bbox in source space
        const srcCx = bb.min.x + bbW / 2;
        const srcCy = bb.min.y + bbH / 2;
        // After rotation, bbox dims swap for 90°
        const rotBbW = Math.abs(bbW * Math.cos(angleRad)) + Math.abs(bbH * Math.sin(angleRad));
        const rotBbH = Math.abs(bbW * Math.sin(angleRad)) + Math.abs(bbH * Math.cos(angleRad));
        // Destination centre in DXF coords (Y-flipped)
        // placed.y is bottom of bbox in nesting space; after flip top of bbox = sheetH - placed.y
        // centre Y in flipped space = sheetH - placed.y - rotBbH/2
        const destCx = placed.x + rotBbW / 2;
        const destCy = sheetOffsetY + sheetH - placed.y - rotBbH / 2;

        for (const fe of itemDoc.flatEntities) {
          const transformed = transformEntity(fe, srcCx, srcCy, cosA, sinA, destCx, destCy, placed.name, handleCounter);
          if (transformed.length > 0) {
            for (const e of transformed) entities.push(e);
            handleCounter += transformed.length;
          }
        }
      } else {
        // Fallback: bbox rectangle (Y-flipped)
        const x = placed.x;
        const yTop = flipY(placed.y, sheetOffsetY);       // nesting y=bottom → DXF y=top
        const yBot = flipY(placed.y + placed.height, sheetOffsetY);
        const w = placed.width;
        entities.push(createLine(x,     yBot, x + w, yBot, handleCounter++, placed.name));
        entities.push(createLine(x + w, yBot, x + w, yTop, handleCounter++, placed.name));
        entities.push(createLine(x + w, yTop, x,     yTop, handleCounter++, placed.name));
        entities.push(createLine(x,     yTop, x,     yBot, handleCounter++, placed.name));
      }
    }

    const sharedSegments = createCommonLineSegments(
      sheet.placed.map((p) => ({
        x: p.x,
        y: flipY(p.y + p.height, sheetOffsetY),
        width: p.width,
        height: p.height,
      })),
    );
    for (const seg of sharedSegments) {
      entities.push(createLine(seg.x1, seg.y1, seg.x2, seg.y2, handleCounter++, 'COMMON_LINE'));
    }
  }

  // Создаём контуры листов
  let sheetHandle = 5000;
  for (let i = 0; i < nestingResult.sheets.length; i++) {
    const sheetX = 0;
    const sheetY = i * (sheetH + nestingResult.gap);
    const sheetW = nestingResult.sheet.width;

    // Контур листа (4 линии)
    entities.push(createLine(sheetX, sheetY, sheetX + sheetW, sheetY, sheetHandle++, 'SHEET'));
    entities.push(createLine(sheetX + sheetW, sheetY, sheetX + sheetW, sheetY + sheetH, sheetHandle++, 'SHEET'));
    entities.push(createLine(sheetX + sheetW, sheetY + sheetH, sheetX, sheetY + sheetH, sheetHandle++, 'SHEET'));
    entities.push(createLine(sheetX, sheetY + sheetH, sheetX, sheetY, sheetHandle++, 'SHEET'));
  }

  const dxfDoc = createDXFDocument(entities);
  return dxfDocToAscii(dxfDoc);
}

/**
 * Apply 2D rotation (around srcCx,srcCy) + translation (to destCx,destCy) to a FlattenedEntity.
 * Returns array of DXFEntity (LINE, ARC, CIRCLE, or LWPOLYLINE).
 */
function transformEntity(
  fe: FlattenedEntity,
  srcCx: number, srcCy: number,
  cosA: number, sinA: number,
  destCx: number, destCy: number,
  layer: string,
  baseHandle: number,
): DXFEntity[] {
  const e = fe.entity;

  function tx(x: number, y: number): { x: number; y: number } {
    // Apply source transform matrix first
    const p = mat4TransformPoint(fe.transform, { x, y, z: 0 });
    // Rotate around srcCx, srcCy
    const dx = p.x - srcCx;
    const dy = p.y - srcCy;
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    return { x: destCx + rx, y: destCy + ry };
  }

  if (e.type === DXFEntityType.LINE) {
    const l = e as DXFLineEntity;
    const s = tx(l.start.x, l.start.y);
    const en = tx(l.end.x, l.end.y);
    return [{ type: DXFEntityType.LINE, handle: String(baseHandle), layer, visible: true, start: { ...s, z: 0 }, end: { ...en, z: 0 } } as DXFLineEntity];
  }

  if (e.type === DXFEntityType.CIRCLE) {
    const c = e as DXFCircleEntity;
    const ctr = tx(c.center.x, c.center.y);
    return [{ type: DXFEntityType.CIRCLE, handle: String(baseHandle), layer, visible: true, center: { ...ctr, z: 0 }, radius: c.radius } as DXFCircleEntity];
  }

  if (e.type === DXFEntityType.ARC) {
    const a = e as DXFArcEntity;
    const ctr = tx(a.center.x, a.center.y);
    const rotDeg = Math.atan2(sinA, cosA) * (180 / Math.PI);
    return [{ type: DXFEntityType.ARC, handle: String(baseHandle), layer, visible: true, center: { ...ctr, z: 0 }, radius: a.radius, startAngle: a.startAngle + rotDeg, endAngle: a.endAngle + rotDeg } as DXFArcEntity];
  }

  if (e.type === DXFEntityType.LWPOLYLINE) {
    const lw = e as DXFLWPolylineEntity;
    const verts = lw.vertices.map(v => tx(v.x, v.y));
    return [{ type: DXFEntityType.LWPOLYLINE, handle: String(baseHandle), layer, visible: true, vertices: verts, closed: lw.closed, constantWidth: lw.constantWidth } as DXFLWPolylineEntity];
  }

  // Fallback: tessellate to line segments via bbox representation — skip unsupported types silently
  return [];
}

function createLine(x1: number, y1: number, x2: number, y2: number, handle: number, layer: string): DXFEntity {
  return {
    type: DXFEntityType.LINE,
    handle: String(handle),
    layer,
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    visible: true,
  };
}

function createDXFDocument(entities: DXFEntity[]): DXFDocument {
  return {
    header: new Map(),
    metadata: {
      version: DXFVersion.R2018,
      format: DXFFormat.ASCII,
      handle: '0',
      units: 1,
      extents: { min: { x: 0, y: 0, z: 0 }, max: { x: 1000, y: 1000, z: 0 } },
      entityCount: entities.length,
      layerCount: 3,
      blockCount: 0,
    },
    entities,
    layers: new Map<string, DXFLayer>([
      ['0', { name: '0', color: { r: 255, g: 255, b: 255 }, lineType: 'Continuous', lineWeight: 0, visible: true, frozen: false, locked: false }],
      ['SHEET', { name: 'SHEET', color: { r: 128, g: 128, b: 128 }, lineType: 'Continuous', lineWeight: 0, visible: true, frozen: false, locked: false }],
      ['COMMON_LINE', { name: 'COMMON_LINE', color: { r: 0, g: 255, b: 157 }, lineType: 'Continuous', lineWeight: 0, visible: true, frozen: false, locked: false }],
    ]),
    blocks: new Map(),
    lineTypes: new Map(),
    textStyles: new Map(),
    dimStyles: new Map(),
  };
}

function dxfDocToAscii(doc: DXFDocument): string {
  const lines: string[] = [];
  
  // Header section
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('HEADER');
  lines.push('9');
  lines.push('$ACADVER');
  lines.push('1');
  lines.push('AC1032'); // AutoCAD 2018
  lines.push('0');
  lines.push('ENDSEC');

  // Tables section
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('TABLES');
  
  // Layer table
  lines.push('0');
  lines.push('TABLE');
  lines.push('2');
  lines.push('LAYER');
  
  for (const layer of doc.layers.values()) {
    lines.push('0');
    lines.push('LAYER');
    lines.push('2');
    lines.push(layer.name);
    lines.push('70');
    lines.push('0');
    lines.push('62');
    lines.push('7'); // White color
    lines.push('6');
    lines.push('Continuous');
  }
  
  lines.push('0');
  lines.push('ENDTAB');
  lines.push('0');
  lines.push('ENDSEC');

  // Blocks section
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('BLOCKS');
  lines.push('0');
  lines.push('ENDSEC');

  // Entities section
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('ENTITIES');
  
  for (const entity of doc.entities) {
    const e = entity as any;
    const h = e.handle || '100';
    const lay = e.layer || '0';

    if (entity.type === DXFEntityType.LINE) {
      lines.push('0', 'LINE', '5', h, '8', lay);
      lines.push('10', String(e.start.x), '20', String(e.start.y), '30', String(e.start.z || 0));
      lines.push('11', String(e.end.x),   '21', String(e.end.y),   '31', String(e.end.z   || 0));
    } else if (entity.type === DXFEntityType.CIRCLE) {
      lines.push('0', 'CIRCLE', '5', h, '8', lay);
      lines.push('10', String(e.center.x), '20', String(e.center.y), '30', String(e.center.z || 0));
      lines.push('40', String(e.radius));
    } else if (entity.type === DXFEntityType.ARC) {
      lines.push('0', 'ARC', '5', h, '8', lay);
      lines.push('10', String(e.center.x), '20', String(e.center.y), '30', String(e.center.z || 0));
      lines.push('40', String(e.radius));
      lines.push('50', String(e.startAngle), '51', String(e.endAngle));
    } else if (entity.type === DXFEntityType.LWPOLYLINE) {
      lines.push('0', 'LWPOLYLINE', '5', h, '8', lay);
      lines.push('90', String(e.vertices.length));
      lines.push('70', e.closed ? '1' : '0');
      for (const v of e.vertices) {
        lines.push('10', String(v.x), '20', String(v.y));
      }
      if (e.constantWidth != null) lines.push('43', String(e.constantWidth));
    }
  }
  
  lines.push('0');
  lines.push('ENDSEC');
  lines.push('0');
  lines.push('EOF');

  return lines.join('\n');
}

// ─── Экспорт в CSV ──────────────────────────────────────────────────

/** Опции экспорта статистики резки */
export interface ExportCuttingStatsOptions {
  readonly stats: CuttingStats;
  readonly fileName?: string;
}

/**
 * Экспортирует статистику резки в формат CSV.
 * @param options - Опции экспорта
 * @returns CSV файл в виде строки
 */
export function exportCuttingStatsToCSV(options: ExportCuttingStatsOptions): string {
  const { stats, fileName = 'cutting_stats' } = options;
  
  const lines: string[] = [];
  
  // Заголовок
  lines.push(`# ${fileName}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');
  
  // Общая статистика
  lines.push('General Statistics');
  lines.push('Parameter,Value,Unit');
  lines.push(`Total Pierces,${stats.totalPierces},pcs`);
  lines.push(`Total Cut Length,${stats.totalCutLength.toFixed(2)},mm`);
  lines.push(`Total Cut Length,${(stats.totalCutLength / 1000).toFixed(2)},m`);
  lines.push(`Entity Count,${stats.cuttingEntityCount},pcs`);
  lines.push(`Chain Count,${stats.chains.length},pcs`);
  lines.push('');
  
  // Статистика по слоям
  lines.push('Layer Statistics');
  lines.push('Layer,Pierces,Cut Length (mm),Entity Count');
  
  for (const layerStats of stats.byLayer.values()) {
    lines.push(`${layerStats.layerName},${layerStats.pierces},${layerStats.cutLength.toFixed(2)},${layerStats.entityCount}`);
  }
  
  lines.push('');
  
  // Детали по цепочкам
  lines.push('Chain Details');
  lines.push('Chain Index,Layer,Cut Length (mm),Is Closed,Pierce X,Pierce Y,Pierce Z');
  
  for (let i = 0; i < stats.chains.length; i++) {
    const chain = stats.chains[i]!;
    lines.push(
      `${chain.chainIndex},${chain.layer},${chain.cutLength.toFixed(2)},${chain.isClosed},` +
      `${chain.piercePoint.x.toFixed(4)},${chain.piercePoint.y.toFixed(4)},${chain.piercePoint.z.toFixed(4)}`
    );
  }
  
  return lines.join('\n');
}

/** Опции экспорта раскладки в CSV */
export interface ExportNestingCSVOptions {
  readonly nestingResult: NestingResult;
  readonly fileName?: string;
}

/**
 * Экспортирует раскладку в формат CSV.
 * @param options - Опции экспорта
 * @returns CSV файл в виде строки
 */
export function exportNestingToCSV(options: ExportNestingCSVOptions): string {
  const { nestingResult, fileName = 'nesting' } = options;
  
  const lines: string[] = [];
  
  // Заголовок
  lines.push(`# ${fileName}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('');
  
  // Общая информация
  lines.push('Nesting Summary');
  lines.push('Parameter,Value');
  lines.push(`Sheet Size,${nestingResult.sheet.width} x ${nestingResult.sheet.height} mm`);
  lines.push(`Gap,${nestingResult.gap} mm`);
  lines.push(`Total Sheets,${nestingResult.totalSheets}`);
  lines.push(`Total Placed,${nestingResult.totalPlaced}`);
  lines.push(`Total Required,${nestingResult.totalRequired}`);
  lines.push(`Average Fill,${nestingResult.avgFillPercent.toFixed(1)}%`);
  lines.push(`Cut Length Estimate,${nestingResult.cutLengthEstimate.toFixed(2)} mm`);
  lines.push(`Shared Cut Length,${nestingResult.sharedCutLength.toFixed(2)} mm`);
  lines.push(`Cut Length After Merge,${nestingResult.cutLengthAfterMerge.toFixed(2)} mm`);
  lines.push(`Pierce Estimate,${nestingResult.pierceEstimate}`);
  lines.push(`Pierce Delta,${nestingResult.pierceDelta}`);
  lines.push('');
  
  // Детали по листам
  lines.push('Sheet Details');
  lines.push('Sheet Index,Placed Count,Used Area (mm²),Fill Percent');
  
  for (const sheet of nestingResult.sheets) {
    lines.push(`${sheet.sheetIndex},${sheet.placed.length},${sheet.usedArea.toFixed(2)},${sheet.fillPercent.toFixed(1)}`);
  }
  
  lines.push('');
  
  // Размещённые детали
  lines.push('Placed Items');
  lines.push('Sheet Index,Item ID,Name,X (mm),Y (mm),Width (mm),Height (mm),Rotated,Angle Deg,Copy Index');
  
  for (const sheet of nestingResult.sheets) {
    for (const placed of sheet.placed) {
      lines.push(
        `${sheet.sheetIndex},${placed.itemId},${placed.name},${placed.x.toFixed(4)},${placed.y.toFixed(4)},` +
        `${placed.width.toFixed(4)},${placed.height.toFixed(4)},${placed.rotated},${placed.angleDeg.toFixed(2)},${placed.copyIndex}`
      );
    }
  }
  
  return lines.join('\n');
}

// ─── Главный экспорт ────────────────────────────────────────────────

/** Типы экспорта */
export type ExportFormat = 'DXF' | 'CSV';

/** Объединённые опции экспорта */
export interface ExportOptions {
  readonly format: ExportFormat;
  readonly nestingResult?: NestingResult;
  readonly cuttingStats?: CuttingStats;
  readonly fileName: string;
}

/**
 * Экспортирует результаты в указанном формате.
 * @param options - Опции экспорта
 * @returns Файл в виде строки
 */
export function exportResults(options: ExportOptions): string {
  const { format, nestingResult, cuttingStats, fileName } = options;
  
  switch (format) {
    case 'DXF':
      if (!nestingResult) {
        throw new Error('Nesting result is required for DXF export');
      }
      return exportNestingToDXF({ nestingResult });
    
    case 'CSV':
      if (nestingResult) {
        return exportNestingToCSV({ nestingResult, fileName });
      }
      if (cuttingStats) {
        return exportCuttingStatsToCSV({ stats: cuttingStats, fileName });
      }
      throw new Error('Either nestingResult or cuttingStats is required for CSV export');
    
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
