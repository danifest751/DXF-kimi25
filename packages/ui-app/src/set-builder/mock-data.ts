import type { LibraryItem, SheetPreset } from './types.js';

export const CATALOGS = ['All', 'Kitchen', 'Facade', 'Tech'];

export const SHEET_PRESETS: readonly SheetPreset[] = [
  { id: 'sheet_1000x2000', label: 'Sheet 1000x2000', w: 1000, h: 2000 },
  { id: 'sheet_1250x2500', label: 'Sheet 1250x2500', w: 1250, h: 2500 },
  { id: 'coil_1000_inf', label: 'Coil 1000x∞', w: 1000, h: 12000, isCoil: true },
];

const BASE_ITEMS: Array<Omit<LibraryItem, 'id'>> = [
  { name: 'Panel-A1.dxf', catalog: 'Kitchen', w: 520, h: 310, areaMm2: Math.round(520 * 310 * 0.7), pierces: 24, cutLen: 4280, layersCount: 3, status: 'ok', issues: [], thumbVariant: 1 },
  { name: 'Panel-A2.dxf', catalog: 'Kitchen', w: 460, h: 280, areaMm2: Math.round(460 * 280 * 0.7), pierces: 19, cutLen: 3670, layersCount: 2, status: 'warn', issues: ['Open contour detected'], thumbVariant: 2 },
  { name: 'Frame-F1.dxf', catalog: 'Facade', w: 780, h: 420, areaMm2: Math.round(780 * 420 * 0.7), pierces: 38, cutLen: 6110, layersCount: 4, status: 'ok', issues: [], thumbVariant: 3 },
  { name: 'Bracket-T4.dxf', catalog: 'Tech', w: 180, h: 120, areaMm2: Math.round(180 * 120 * 0.7), pierces: 8, cutLen: 940, layersCount: 2, status: 'ok', issues: [], thumbVariant: 4 },
  { name: 'Facade-L2.dxf', catalog: 'Facade', w: 1120, h: 640, areaMm2: Math.round(1120 * 640 * 0.7), pierces: 56, cutLen: 9840, layersCount: 5, status: 'error', issues: ['Self intersection', 'Missing outer contour'], thumbVariant: 5 },
  { name: 'Clip-T2.dxf', catalog: 'Tech', w: 90, h: 65, areaMm2: Math.round(90 * 65 * 0.7), pierces: 4, cutLen: 420, layersCount: 1, status: 'ok', issues: [], thumbVariant: 6 },
  { name: 'Door-K3.dxf', catalog: 'Kitchen', w: 700, h: 360, areaMm2: Math.round(700 * 360 * 0.7), pierces: 27, cutLen: 4740, layersCount: 3, status: 'warn', issues: ['Tiny island contour'], thumbVariant: 7 },
  { name: 'Panel-K8.dxf', catalog: 'Kitchen', w: 840, h: 440, areaMm2: Math.round(840 * 440 * 0.7), pierces: 31, cutLen: 5360, layersCount: 4, status: 'ok', issues: [], thumbVariant: 8 },
  { name: 'Facade-R9.dxf', catalog: 'Facade', w: 960, h: 520, areaMm2: Math.round(960 * 520 * 0.7), pierces: 47, cutLen: 8120, layersCount: 3, status: 'ok', issues: [], thumbVariant: 9 },
  { name: 'Rail-T1.dxf', catalog: 'Tech', w: 620, h: 90, areaMm2: Math.round(620 * 90 * 0.7), pierces: 14, cutLen: 1780, layersCount: 2, status: 'warn', issues: ['Open contour detected'], thumbVariant: 10 },
  { name: 'Shelf-K6.dxf', catalog: 'Kitchen', w: 430, h: 280, areaMm2: Math.round(430 * 280 * 0.7), pierces: 15, cutLen: 2510, layersCount: 2, status: 'ok', issues: [], thumbVariant: 11 },
  { name: 'Support-T8.dxf', catalog: 'Tech', w: 210, h: 180, areaMm2: Math.round(210 * 180 * 0.7), pierces: 12, cutLen: 1490, layersCount: 2, status: 'ok', issues: [], thumbVariant: 12 },
];

export function createInitialLibrary(): LibraryItem[] {
  return BASE_ITEMS.map((item, i) => ({ id: i + 1, ...item }));
}

export function createUploadedMockItems(startId: number, fileNames: readonly string[]): LibraryItem[] {
  const names = fileNames.length > 0
    ? fileNames.slice(0, 2)
    : ['Uploaded-Mock-1.dxf', 'Uploaded-Mock-2.dxf'];
  return names.map((name, i) => {
    const w = 300 + i * 90;
    const h = 200 + i * 70;
    return {
      id: startId + i,
      name,
      catalog: i % 2 === 0 ? 'Kitchen' : 'Tech',
      w,
      h,
      areaMm2: Math.round(w * h * 0.7),
      pierces: 10 + i * 7,
      cutLen: 1800 + i * 920,
      layersCount: 2 + i,
      status: i % 2 === 0 ? ('ok' as const) : ('warn' as const),
      issues: i % 2 === 0 ? [] : ['Open contour detected'],
      thumbVariant: 50 + i,
    };
  });
}
