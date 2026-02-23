/**
 * @module bot-service
 * Telegram bot service.
 * Принимает DXF, считает врезки/длину реза и отправляет JPEG-превью.
 */

import jpeg from 'jpeg-js';
import { parseDXF } from '../../core-engine/src/dxf/reader/index.js';
import { normalizeDocument, type FlattenedEntity, type NormalizedDocument } from '../../core-engine/src/normalize/index.js';
import { computeCuttingStats, formatCutLength } from '../../core-engine/src/cutting/index.js';
import { nestItems, SHEET_PRESETS, type NestingItem, type NestingOptions, type NestingResult, type SheetSize } from '../../core-engine/src/nesting/index.js';
import { exportNestingToDXF, exportNestingToCSV } from '../../core-engine/src/export/index.js';
import { mat4TransformPoint } from '../../core-engine/src/geometry/math.js';
import { DXFEntityType, type Point3D } from '../../core-engine/src/types/index.js';

export interface BotMessage {
  readonly chatId: string;
  readonly text: string;
  readonly attachments?: readonly Buffer[];
}

export interface BotResponse {
  readonly success: boolean;
  readonly message: string;
  readonly data?: unknown;
}

interface TelegramResponse<T> {
  readonly ok: boolean;
  readonly result?: T;
  readonly description?: string;
}

interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: {
    readonly chat: { readonly id: number };
    readonly text?: string;
    readonly document?: {
      readonly file_id: string;
      readonly file_name?: string;
      readonly mime_type?: string;
    };
  };
  readonly callback_query?: {
    readonly id: string;
    readonly data?: string;
    readonly message?: {
      readonly chat: { readonly id: number };
    };
  };
}

interface TelegramFile {
  readonly file_path: string;
}

interface BotCuttingSummary {
  readonly totalPierces: number;
  readonly totalCutLength: number;
}

interface BotAnalysisResult {
  readonly previewJpeg: Buffer;
  readonly summary: BotCuttingSummary;
  readonly nestingItems: readonly NestingItem[];
}

interface SavedNestingVariant {
  readonly name: string;
  readonly nesting: NestingResult;
}

interface PendingNestingContext {
  readonly fileNames: readonly string[];
  readonly summary: BotCuttingSummary;
  readonly items: readonly NestingItem[];
  readonly nextItemId: number;
  readonly quantity: number | null;
  readonly sheet: SheetSize;
  readonly gap: number;
  readonly mode: 'fast' | 'precise' | 'common';
  readonly previewJpeg: Buffer;
  readonly lastNesting: NestingResult | null;
  readonly variants: readonly SavedNestingVariant[];
  readonly activeVariantIndex: number | null;
  readonly awaitingInput: 'none' | 'quantity' | 'custom_sheet';
}

const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 720;
const PREVIEW_PADDING = 28;
const NESTING_PREVIEW_WIDTH = 1280;
const NESTING_PREVIEW_HEIGHT = 720;
const NESTING_CALLBACK_PREFIX = 'nest:';
const ACTION_CALLBACK_PREFIX = 'act:';
const QUANTITY_CALLBACK_PREFIX = 'qty:';
const VARIANT_CALLBACK_PREFIX = 'var:';
const chatNestingContext = new Map<number, PendingNestingContext>();

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function telegramSendMessageWithKeyboard(
  token: string,
  chatId: number,
  text: string,
  keyboardRows: readonly (readonly { text: string; callback_data: string }[])[],
  parseMode: 'HTML' | '' = '',
): Promise<void> {
  const params: Record<string, string> = {
    chat_id: String(chatId),
    text,
    reply_markup: JSON.stringify({ inline_keyboard: keyboardRows }),
  };
  if (parseMode) params.parse_mode = parseMode;
  await telegramGet(token, 'sendMessage', params);
}

function setPixel(pixels: Uint8Array, width: number, height: number, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
  const idx = (iy * width + ix) * 4;
  pixels[idx] = 20;
  pixels[idx + 1] = 20;
  pixels[idx + 2] = 20;
  pixels[idx + 3] = 255;
}

function setPixelRgb(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
  const idx = (iy * width + ix) * 4;
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = 255;
}

function drawLine(pixels: Uint8Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 0) {
    setPixel(pixels, width, height, x0, y0);
    return;
  }

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    setPixel(pixels, width, height, x0 + dx * t, y0 + dy * t);
  }
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width - 1, Math.ceil(x + w));
  const y1 = Math.min(height - 1, Math.ceil(y + h));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      setPixelRgb(pixels, width, height, px, py, r, g, b);
    }
  }
}

function renderPreview(normalized: NormalizedDocument): Buffer {
  const width = PREVIEW_WIDTH;
  const height = PREVIEW_HEIGHT;
  const pixels = Buffer.alloc(width * height * 4, 255);
  const bb = normalized.totalBBox;

  if (bb === null) {
    return Buffer.from(jpeg.encode({ data: pixels, width, height }, 88).data);
  }

  const spanX = Math.max(bb.max.x - bb.min.x, 1);
  const spanY = Math.max(bb.max.y - bb.min.y, 1);
  const scale = Math.min((width - PREVIEW_PADDING * 2) / spanX, (height - PREVIEW_PADDING * 2) / spanY);

  const toScreen = (p: Point3D): { x: number; y: number } => ({
    x: PREVIEW_PADDING + (p.x - bb.min.x) * scale,
    y: height - PREVIEW_PADDING - (p.y - bb.min.y) * scale,
  });

  const drawPolyline = (pts: readonly Point3D[], closed: boolean): void => {
    for (let i = 1; i < pts.length; i++) {
      const a = toScreen(pts[i - 1]!);
      const b = toScreen(pts[i]!);
      drawLine(pixels, width, height, a.x, a.y, b.x, b.y);
    }
    if (closed && pts.length > 2) {
      const a = toScreen(pts[pts.length - 1]!);
      const b = toScreen(pts[0]!);
      drawLine(pixels, width, height, a.x, a.y, b.x, b.y);
    }
  };

  const drawArc = (center: Point3D, radius: number, startAngle: number, endAngle: number): void => {
    let s = startAngle;
    let e = endAngle;
    if (e < s) e += 360;
    const segments = Math.max(16, Math.ceil(Math.abs(e - s) / 5));

    let prev: Point3D | null = null;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = degToRad(s + (e - s) * t);
      const p: Point3D = {
        x: center.x + Math.cos(a) * radius,
        y: center.y + Math.sin(a) * radius,
        z: center.z,
      };
      if (prev !== null) {
        const sp = toScreen(prev);
        const ep = toScreen(p);
        drawLine(pixels, width, height, sp.x, sp.y, ep.x, ep.y);
      }
      prev = p;
    }
  };

  for (const fe of normalized.flatEntities) {
    const e = fe.entity;

    if (!e.visible) continue;

    if (e.type === DXFEntityType.LINE) {
      const p0 = toScreen(mat4TransformPoint(fe.transform, e.start));
      const p1 = toScreen(mat4TransformPoint(fe.transform, e.end));
      drawLine(pixels, width, height, p0.x, p0.y, p1.x, p1.y);
      continue;
    }

    if (e.type === DXFEntityType.POLYLINE) {
      const pts = e.vertices.map((v) => mat4TransformPoint(fe.transform, v));
      drawPolyline(pts, e.closed);
      continue;
    }

    if (e.type === DXFEntityType.LWPOLYLINE) {
      const pts = e.vertices.map((v) => mat4TransformPoint(fe.transform, { x: v.x, y: v.y, z: 0 }));
      drawPolyline(pts, e.closed);
      continue;
    }

    if (e.type === DXFEntityType.CIRCLE) {
      const center = mat4TransformPoint(fe.transform, e.center);
      const edge = mat4TransformPoint(fe.transform, { x: e.center.x + e.radius, y: e.center.y, z: e.center.z });
      const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
      drawArc(center, radius, 0, 360);
      continue;
    }

    if (e.type === DXFEntityType.ARC) {
      const center = mat4TransformPoint(fe.transform, e.center);
      const edge = mat4TransformPoint(fe.transform, { x: e.center.x + e.radius, y: e.center.y, z: e.center.z });
      const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
      drawArc(center, radius, e.startAngle, e.endAngle);
      continue;
    }

    drawEntityBBoxFallback(pixels, width, height, fe, toScreen);
  }

  return Buffer.from(jpeg.encode({ data: pixels, width, height }, 88).data);
}

function drawEntityBBoxFallback(
  pixels: Uint8Array,
  width: number,
  height: number,
  fe: FlattenedEntity,
  toScreen: (p: Point3D) => { x: number; y: number },
): void {
  const bb = fe.entity.boundingBox;
  if (bb === undefined) return;

  const p1 = mat4TransformPoint(fe.transform, bb.min);
  const p2 = mat4TransformPoint(fe.transform, { x: bb.max.x, y: bb.min.y, z: bb.min.z });
  const p3 = mat4TransformPoint(fe.transform, bb.max);
  const p4 = mat4TransformPoint(fe.transform, { x: bb.min.x, y: bb.max.y, z: bb.min.z });

  const s1 = toScreen(p1);
  const s2 = toScreen(p2);
  const s3 = toScreen(p3);
  const s4 = toScreen(p4);

  drawLine(pixels, width, height, s1.x, s1.y, s2.x, s2.y);
  drawLine(pixels, width, height, s2.x, s2.y, s3.x, s3.y);
  drawLine(pixels, width, height, s3.x, s3.y, s4.x, s4.y);
  drawLine(pixels, width, height, s4.x, s4.y, s1.x, s1.y);
}

function getEntityWorldBBox(fe: FlattenedEntity): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const bb = fe.entity.boundingBox;
  if (bb === undefined) return null;

  const p1 = mat4TransformPoint(fe.transform, bb.min);
  const p2 = mat4TransformPoint(fe.transform, { x: bb.max.x, y: bb.min.y, z: bb.min.z });
  const p3 = mat4TransformPoint(fe.transform, bb.max);
  const p4 = mat4TransformPoint(fe.transform, { x: bb.min.x, y: bb.max.y, z: bb.min.z });
  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function extractNestingItems(normalized: NormalizedDocument): readonly NestingItem[] {
  const stats = computeCuttingStats(normalized);
  const items: NestingItem[] = [];

  for (let i = 0; i < stats.chains.length; i++) {
    const chain = stats.chains[i]!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const entityIndex of chain.entityIndices) {
      const fe = normalized.flatEntities[entityIndex];
      if (fe === undefined) continue;
      const bb = getEntityWorldBBox(fe);
      if (bb === null) continue;
      minX = Math.min(minX, bb.minX);
      minY = Math.min(minY, bb.minY);
      maxX = Math.max(maxX, bb.maxX);
      maxY = Math.max(maxY, bb.maxY);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      continue;
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    items.push({
      id: i + 1,
      name: `Part ${i + 1}`,
      width,
      height,
      quantity: 1,
    });
  }

  if (items.length > 0) {
    return items;
  }

  const total = normalized.totalBBox;
  if (total === null) return [];

  return [{
    id: 1,
    name: 'Part 1',
    width: Math.max(1, total.max.x - total.min.x),
    height: Math.max(1, total.max.y - total.min.y),
    quantity: 1,
  }];
}

function renderNestingPreview(result: NestingResult): Buffer {
  const width = NESTING_PREVIEW_WIDTH;
  const height = NESTING_PREVIEW_HEIGHT;
  const pixels = Buffer.alloc(width * height * 4, 255);
  const sheet = result.sheets[0];

  if (sheet === undefined || sheet.placed.length === 0) {
    return Buffer.from(jpeg.encode({ data: pixels, width, height }, 88).data);
  }

  const sheetW = Math.max(result.sheet.width, 1);
  const sheetH = Math.max(result.sheet.height, 1);
  const scale = Math.min(
    (width - PREVIEW_PADDING * 2) / sheetW,
    (height - PREVIEW_PADDING * 2) / sheetH,
  );

  const ox = PREVIEW_PADDING;
  const oy = height - PREVIEW_PADDING;
  const toX = (x: number): number => ox + x * scale;
  const toY = (y: number): number => oy - y * scale;

  drawLine(pixels, width, height, toX(0), toY(0), toX(sheetW), toY(0));
  drawLine(pixels, width, height, toX(sheetW), toY(0), toX(sheetW), toY(sheetH));
  drawLine(pixels, width, height, toX(sheetW), toY(sheetH), toX(0), toY(sheetH));
  drawLine(pixels, width, height, toX(0), toY(sheetH), toX(0), toY(0));

  for (let i = 0; i < sheet.placed.length; i++) {
    const p = sheet.placed[i]!;
    const colorR = 80 + (i * 53) % 140;
    const colorG = 90 + (i * 79) % 130;
    const colorB = 100 + (i * 37) % 120;
    const x = toX(p.x);
    const y = toY(p.y + p.height);
    const w = p.width * scale;
    const h = p.height * scale;

    fillRect(pixels, width, height, x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2), colorR, colorG, colorB);
    drawLine(pixels, width, height, x, y, x + w, y);
    drawLine(pixels, width, height, x + w, y, x + w, y + h);
    drawLine(pixels, width, height, x + w, y + h, x, y + h);
    drawLine(pixels, width, height, x, y + h, x, y);
  }

  return Buffer.from(jpeg.encode({ data: pixels, width, height }, 88).data);
}

function analyzeDXF(buffer: Buffer): BotAnalysisResult {
  const doc = parseDXF(toArrayBuffer(buffer));
  const normalized = normalizeDocument(doc);
  const stats = computeCuttingStats(normalized);

  return {
    previewJpeg: renderPreview(normalized),
    summary: {
      totalPierces: stats.totalPierces,
      totalCutLength: stats.totalCutLength,
    },
    nestingItems: extractNestingItems(normalized),
  };
}

async function telegramGet<T>(token: string, method: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params);
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}?${query.toString()}`);
  const data = await response.json() as TelegramResponse<T>;
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description ?? `Telegram method ${method} failed`);
  }
  return data.result;
}

async function telegramSendMessage(token: string, chatId: number, text: string): Promise<void> {
  await telegramGet(token, 'sendMessage', {
    chat_id: String(chatId),
    text,
  });
}

async function telegramSendPhoto(token: string, chatId: number, photo: Buffer, caption: string): Promise<void> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'preview.jpg');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json() as TelegramResponse<unknown>;
  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? 'Telegram sendPhoto failed');
  }
}

async function telegramSendDocument(
  token: string,
  chatId: number,
  document: Buffer,
  fileName: string,
  caption: string,
  mimeType: string,
): Promise<void> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('document', new Blob([new Uint8Array(document)], { type: mimeType }), fileName);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json() as TelegramResponse<unknown>;
  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? 'Telegram sendDocument failed');
  }
}

async function telegramAnswerCallbackQuery(token: string, callbackQueryId: string): Promise<void> {
  await telegramGet(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
  });
}

function getSheetFromCallbackData(data: string): SheetSize | null {
  if (!data.startsWith(NESTING_CALLBACK_PREFIX)) return null;
  const payload = data.slice(NESTING_CALLBACK_PREFIX.length);
  const [rawW, rawH] = payload.split('x');
  const width = Number(rawW);
  const height = Number(rawH);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function buildSheetButtons(): readonly (readonly { text: string; callback_data: string }[])[] {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < SHEET_PRESETS.length; i += 2) {
    const row: { text: string; callback_data: string }[] = [];
    const a = SHEET_PRESETS[i];
    const b = SHEET_PRESETS[i + 1];
    if (a !== undefined) {
      row.push({
        text: a.label,
        callback_data: `${NESTING_CALLBACK_PREFIX}${a.size.width}x${a.size.height}`,
      });
    }
    if (b !== undefined) {
      row.push({
        text: b.label,
        callback_data: `${NESTING_CALLBACK_PREFIX}${b.size.width}x${b.size.height}`,
      });
    }
    rows.push(row);
  }
  rows.push([{ text: 'Свой размер (ввести)', callback_data: `${ACTION_CALLBACK_PREFIX}sheet_custom` }]);
  rows.push([{ text: 'Назад в меню', callback_data: `${ACTION_CALLBACK_PREFIX}menu` }]);
  return rows;
}

function isPositiveIntegerText(text: string): boolean {
  return /^\d+$/.test(text.trim());
}

function parseSheetSizeText(text: string): SheetSize | null {
  const normalized = text.trim().toLowerCase().replace('х', 'x').replace('*', 'x');
  const match = normalized.match(/^(\d{2,5})\s*x\s*(\d{2,5})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

// ─── UI: метки и утилиты ─────────────────────────────────────────────

const MODE_LABELS: Record<PendingNestingContext['mode'], string> = {
  fast: 'Быстрый',
  precise: 'Точный',
  common: 'Общий рез',
};

type InlineBtn = { text: string; callback_data: string };
type BtnRow = readonly InlineBtn[];
type BtnGrid = readonly BtnRow[];

function getActiveVariant(context: PendingNestingContext): SavedNestingVariant | null {
  if (context.activeVariantIndex === null) return null;
  return context.variants[context.activeVariantIndex] ?? null;
}

function getPrimaryFileLabel(context: PendingNestingContext): string {
  if (context.fileNames.length === 0) return 'без_имени';
  if (context.fileNames.length === 1) return context.fileNames[0]!;
  return `${context.fileNames[0]} +${context.fileNames.length - 1}`;
}

// ─── Экран 1: Главный (компактный дашборд) ──────────────────────

function composeHomeText(ctx: PendingNestingContext): string {
  const v = getActiveVariant(ctx);
  const lines = [
    `📁 <b>${getPrimaryFileLabel(ctx)}</b>`,
    `✂️ ${ctx.summary.totalPierces} врезок · ${formatCutLength(ctx.summary.totalCutLength, 'm')} · ${ctx.items.length} дет.`,
    '',
    `🔢 <b>${ctx.quantity ?? '—'}</b> шт  ·  📐 ${ctx.sheet.width}×${ctx.sheet.height}  ·  ${MODE_LABELS[ctx.mode]}`,
  ];
  if (v !== null) {
    const n = v.nesting;
    lines.push(
      '',
      `✅ <b>${v.name}</b>: ${n.totalSheets} лист. · ${n.avgFillPercent}% · ${n.totalPlaced}/${n.totalRequired} разм.`,
    );
  }
  return lines.join('\n');
}

function buildHomeButtons(ctx: PendingNestingContext): BtnGrid {
  const hasResult = ctx.variants.length > 0;
  const rows: InlineBtn[][] = [
    [
      { text: '▶️ Раскладка', callback_data: `${ACTION_CALLBACK_PREFIX}run_nesting` },
      { text: '⚙️ Настройки', callback_data: `${ACTION_CALLBACK_PREFIX}settings` },
    ],
    [
      { text: '🖼 Превью', callback_data: `${ACTION_CALLBACK_PREFIX}preview` },
      { text: '📎 Добавить файл', callback_data: `${ACTION_CALLBACK_PREFIX}hint_add_file` },
    ],
  ];
  if (hasResult) {
    rows.push([
      { text: '📄 DXF', callback_data: `${ACTION_CALLBACK_PREFIX}export_dxf` },
      { text: '📋 CSV', callback_data: `${ACTION_CALLBACK_PREFIX}export_csv` },
      { text: `📂 Варианты (${ctx.variants.length})`, callback_data: `${ACTION_CALLBACK_PREFIX}variants` },
    ]);
  }
  rows.push([
    { text: '🗑 Сброс', callback_data: `${ACTION_CALLBACK_PREFIX}reset_confirm` },
  ]);
  return rows;
}

async function sendHome(token: string, chatId: number, ctx: PendingNestingContext): Promise<void> {
  await telegramSendMessageWithKeyboard(token, chatId, composeHomeText(ctx), buildHomeButtons(ctx), 'HTML');
}

// ─── Экран 2: Настройки ──────────────────────────────────────

function composeSettingsText(ctx: PendingNestingContext): string {
  return [
    '⚙️ <b>Параметры раскладки</b>',
    '',
    `🔢 Количество: <b>${ctx.quantity ?? '—'}</b>`,
    `📐 Лист: <b>${ctx.sheet.width}×${ctx.sheet.height}</b> мм`,
    `📏 Зазор: <b>${ctx.gap}</b> мм`,
    `🎯 Режим: <b>${MODE_LABELS[ctx.mode]}</b>`,
  ].join('\n');
}

function buildSettingsButtons(ctx: PendingNestingContext): BtnGrid {
  const m = ctx.mode;
  return [
    [
      { text: '🔢 Количество', callback_data: `${ACTION_CALLBACK_PREFIX}set_qty` },
      { text: '📐 Лист', callback_data: `${ACTION_CALLBACK_PREFIX}set_sheet` },
    ],
    [
      { text: `Зазор: ${ctx.gap}`, callback_data: `${ACTION_CALLBACK_PREFIX}set_gap` },
    ],
    [
      { text: m === 'fast' ? '✔ Быстрый' : 'Быстрый', callback_data: `${ACTION_CALLBACK_PREFIX}mode_fast` },
      { text: m === 'precise' ? '✔ Точный' : 'Точный', callback_data: `${ACTION_CALLBACK_PREFIX}mode_precise` },
      { text: m === 'common' ? '✔ Общий рез' : 'Общий рез', callback_data: `${ACTION_CALLBACK_PREFIX}mode_common` },
    ],
    [
      { text: '▶️ Запустить', callback_data: `${ACTION_CALLBACK_PREFIX}run_nesting` },
      { text: '← Назад', callback_data: `${ACTION_CALLBACK_PREFIX}menu` },
    ],
  ];
}

async function sendSettings(token: string, chatId: number, ctx: PendingNestingContext): Promise<void> {
  await telegramSendMessageWithKeyboard(token, chatId, composeSettingsText(ctx), buildSettingsButtons(ctx), 'HTML');
}

// ─── Экран 3: Результат раскладки ──────────────────────────

function composeResultCaption(ctx: PendingNestingContext, variantName: string, n: NestingResult): string {
  const lines = [
    `✅ <b>Раскладка ${variantName}</b> — ${getPrimaryFileLabel(ctx)}`,
    '',
    `📝 ${n.totalSheets} лист. · ${n.avgFillPercent}% заполн. · ${n.totalPlaced}/${n.totalRequired} разм.`,
  ];
  if (n.sharedCutLength > 0) {
    lines.push(`✂️ Совм. рез: ${n.sharedCutLength.toFixed(1)} мм · Экономия: −${n.pierceDelta} врезок`);
  }
  lines.push(
    '',
    `⚙️ ${ctx.quantity} шт · ${ctx.sheet.width}×${ctx.sheet.height} · ${MODE_LABELS[ctx.mode]} · зазор ${ctx.gap}`,
  );
  return lines.join('\n');
}

function buildResultButtons(ctx: PendingNestingContext): BtnGrid {
  return [
    [
      { text: '📄 DXF', callback_data: `${ACTION_CALLBACK_PREFIX}export_dxf` },
      { text: '📋 CSV', callback_data: `${ACTION_CALLBACK_PREFIX}export_csv` },
    ],
    [
      { text: '🔄 Другие параметры', callback_data: `${ACTION_CALLBACK_PREFIX}settings` },
      { text: `📂 Варианты (${ctx.variants.length})`, callback_data: `${ACTION_CALLBACK_PREFIX}variants` },
    ],
    [
      { text: '← Главная', callback_data: `${ACTION_CALLBACK_PREFIX}menu` },
    ],
  ];
}

// ─── Подэкраны: количество, лист, зазор, варианты ──────────────

function buildQuantityButtons(): BtnGrid {
  return [
    [
      { text: '1', callback_data: `${QUANTITY_CALLBACK_PREFIX}1` },
      { text: '5', callback_data: `${QUANTITY_CALLBACK_PREFIX}5` },
      { text: '10', callback_data: `${QUANTITY_CALLBACK_PREFIX}10` },
      { text: '20', callback_data: `${QUANTITY_CALLBACK_PREFIX}20` },
    ],
    [
      { text: '50', callback_data: `${QUANTITY_CALLBACK_PREFIX}50` },
      { text: '100', callback_data: `${QUANTITY_CALLBACK_PREFIX}100` },
    ],
    [{ text: '← Назад', callback_data: `${ACTION_CALLBACK_PREFIX}settings` }],
  ];
}

function buildGapButtons(currentGap: number): BtnGrid {
  const gaps = [0, 2, 5, 10];
  return [
    gaps.map(g => ({
      text: g === currentGap ? `✔ ${g} мм` : `${g} мм`,
      callback_data: `${ACTION_CALLBACK_PREFIX}gap_${g}`,
    })),
    [{ text: '← Назад', callback_data: `${ACTION_CALLBACK_PREFIX}settings` }],
  ];
}

function buildVariantsButtons(ctx: PendingNestingContext): BtnGrid {
  const rows: InlineBtn[][] = [];
  for (let i = 0; i < ctx.variants.length; i++) {
    const v = ctx.variants[i]!;
    const active = ctx.activeVariantIndex === i;
    const label = `${active ? '● ' : ''}${v.name} — ${v.nesting.totalSheets}л. ${v.nesting.avgFillPercent}%`;
    rows.push([{ text: label, callback_data: `${VARIANT_CALLBACK_PREFIX}${i}` }]);
  }
  rows.push([{ text: '← Главная', callback_data: `${ACTION_CALLBACK_PREFIX}menu` }]);
  return rows;
}

// Совместимость: sendDashboard теперь ведёт на home
async function sendDashboard(token: string, chatId: number, ctx: PendingNestingContext): Promise<void> {
  await sendHome(token, chatId, ctx);
}

function toSafeBaseName(fileName: string): string {
  const base = fileName.replace(/\.dxf$/i, '');
  const safe = base.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return safe.length > 0 ? safe : 'result';
}

function appendAnalysisToContext(
  context: PendingNestingContext,
  fileName: string,
  analysis: BotAnalysisResult,
): PendingNestingContext {
  const remappedItems: NestingItem[] = analysis.nestingItems.map((item, index) => ({
    ...item,
    id: context.nextItemId + index,
    name: `${toSafeBaseName(fileName)}:${item.name}`,
  }));

  return {
    ...context,
    fileNames: [...context.fileNames, fileName],
    summary: {
      totalPierces: context.summary.totalPierces + analysis.summary.totalPierces,
      totalCutLength: context.summary.totalCutLength + analysis.summary.totalCutLength,
    },
    items: [...context.items, ...remappedItems],
    nextItemId: context.nextItemId + remappedItems.length,
    mode: context.mode,
    previewJpeg: analysis.previewJpeg,
    lastNesting: null,
    variants: [],
    activeVariantIndex: null,
    awaitingInput: 'none',
  };
}

async function downloadTelegramFile(token: string, fileId: string): Promise<Buffer> {
  const fileInfo = await telegramGet<TelegramFile>(token, 'getFile', {
    file_id: fileId,
  });
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`);
  if (!response.ok) {
    throw new Error(`Failed to download Telegram file: HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

async function handleTelegramUpdate(token: string, update: TelegramUpdate): Promise<void> {
  if (update.callback_query !== undefined) {
    const callback = update.callback_query;
    const data = callback.data;
    const chatId = callback.message?.chat.id;
    await telegramAnswerCallbackQuery(token, callback.id);

    if (chatId === undefined || data === undefined) {
      return;
    }

    const context = chatNestingContext.get(chatId);

    if (data.startsWith(VARIANT_CALLBACK_PREFIX)) {
      if (context === undefined) {
        await telegramSendMessage(token, chatId, 'Сначала отправьте DXF файл.');
        return;
      }
      const idx = Number(data.slice(VARIANT_CALLBACK_PREFIX.length));
      if (!Number.isInteger(idx) || idx < 0 || idx >= context.variants.length) {
        await telegramSendMessage(token, chatId, 'Вариант не найден.');
        return;
      }
      const nextContext: PendingNestingContext = {
        ...context,
        activeVariantIndex: idx,
        lastNesting: context.variants[idx]!.nesting,
      };
      chatNestingContext.set(chatId, nextContext);
      await sendDashboard(token, chatId, nextContext);
      return;
    }

    if (data.startsWith(QUANTITY_CALLBACK_PREFIX)) {
      if (context === undefined) {
        await telegramSendMessage(token, chatId, 'Сначала отправьте DXF файл.');
        return;
      }
      const quantity = Number(data.slice(QUANTITY_CALLBACK_PREFIX.length));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await telegramSendMessage(token, chatId, 'Некорректное количество.');
        return;
      }
      const nextContext: PendingNestingContext = {
        ...context,
        quantity,
        awaitingInput: 'none',
      };
      chatNestingContext.set(chatId, nextContext);
      await sendDashboard(token, chatId, nextContext);
      return;
    }

    if (data.startsWith(ACTION_CALLBACK_PREFIX)) {
      const action = data.slice(ACTION_CALLBACK_PREFIX.length);

      if (action === 'menu') {
        if (context === undefined) {
          await telegramSendMessage(token, chatId, 'Отправьте DXF файл (.dxf), чтобы открыть рабочее меню.');
          return;
        }
        await sendDashboard(token, chatId, context);
        return;
      }

      if (context === undefined) {
        await telegramSendMessage(token, chatId, 'Сначала отправьте DXF файл.');
        return;
      }

      // ── Навигация ──

      if (action === 'settings') {
        await sendSettings(token, chatId, context);
        return;
      }

      if (action === 'preview') {
        await telegramSendPhoto(token, chatId, context.previewJpeg, `Превью: ${getPrimaryFileLabel(context)}`);
        return;
      }

      if (action === 'hint_add_file') {
        await telegramSendMessage(token, chatId, 'Отправьте ещё один DXF файл — он добавится в текущий набор.');
        return;
      }

      // ── Параметры (подэкраны настроек) ──

      if (action === 'set_qty') {
        chatNestingContext.set(chatId, { ...context, awaitingInput: 'quantity' });
        await telegramSendMessageWithKeyboard(
          token, chatId,
          'Количество копий каждой детали:',
          buildQuantityButtons(),
        );
        return;
      }

      if (action === 'set_sheet') {
        await telegramSendMessageWithKeyboard(
          token, chatId,
          'Выберите размер листа или введите свой (напр. 1500x3000):',
          buildSheetButtons(),
        );
        return;
      }

      if (action === 'sheet_custom') {
        chatNestingContext.set(chatId, { ...context, awaitingInput: 'custom_sheet' });
        await telegramSendMessage(token, chatId, 'Введите размер листа, например: 1500x3000');
        return;
      }

      if (action === 'set_gap') {
        await telegramSendMessageWithKeyboard(
          token, chatId,
          `Зазор между деталями (сейчас ${context.gap} мм):`,
          buildGapButtons(context.gap),
        );
        return;
      }

      if (action.startsWith('gap_')) {
        const gap = Number(action.slice(4));
        if (!Number.isFinite(gap) || gap < 0) {
          await telegramSendMessage(token, chatId, 'Некорректный зазор.');
          return;
        }
        const next: PendingNestingContext = { ...context, gap, awaitingInput: 'none' };
        chatNestingContext.set(chatId, next);
        await sendSettings(token, chatId, next);
        return;
      }

      if (action === 'mode_fast' || action === 'mode_precise' || action === 'mode_common') {
        const mode: PendingNestingContext['mode'] =
          action === 'mode_fast' ? 'fast' : action === 'mode_precise' ? 'precise' : 'common';
        const next: PendingNestingContext = { ...context, mode, awaitingInput: 'none' };
        chatNestingContext.set(chatId, next);
        await sendSettings(token, chatId, next);
        return;
      }

      // ── Раскладка ──

      if (action === 'run_nesting') {
        if (context.quantity === null || context.quantity <= 0) {
          await telegramSendMessage(token, chatId, 'Сначала задайте количество (⚙️ Настройки → Количество).');
          return;
        }

        const itemsWithQuantity: NestingItem[] = context.items.map((item) => ({
          ...item,
          quantity: context.quantity!,
        }));
        const nestingOptions: NestingOptions = context.mode === 'fast'
          ? { strategy: 'blf_bbox', multiStart: false, commonLine: { enabled: false }, rotationEnabled: true, rotationAngleStepDeg: 2 }
          : context.mode === 'precise'
            ? { strategy: 'maxrects_bbox', multiStart: true, commonLine: { enabled: false }, rotationEnabled: true, rotationAngleStepDeg: 2 }
            : { strategy: 'maxrects_bbox', multiStart: true, commonLine: { enabled: true, maxMergeDistanceMm: 0.2, minSharedLenMm: 20 }, rotationEnabled: true, rotationAngleStepDeg: 2 };

        const nesting = nestItems(itemsWithQuantity, context.sheet, context.gap, nestingOptions);
        const variantName = `V${context.variants.length + 1}`;

        await telegramSendPhoto(token, chatId, renderNestingPreview(nesting), composeResultCaption(context, variantName, nesting));

        const variants = [...context.variants, { name: variantName, nesting }];
        const next: PendingNestingContext = {
          ...context,
          lastNesting: nesting,
          variants,
          activeVariantIndex: variants.length - 1,
          awaitingInput: 'none',
        };
        chatNestingContext.set(chatId, next);
        await telegramSendMessageWithKeyboard(token, chatId, 'Что дальше?', buildResultButtons(next), 'HTML');
        return;
      }

      // ── Варианты ──

      if (action === 'variants') {
        if (context.variants.length === 0) {
          await telegramSendMessage(token, chatId, 'Нет вариантов. Запустите раскладку.');
          return;
        }
        await telegramSendMessageWithKeyboard(
          token, chatId,
          'Выберите вариант:',
          buildVariantsButtons(context),
        );
        return;
      }

      // ── Сброс ──

      if (action === 'reset_confirm') {
        await telegramSendMessageWithKeyboard(
          token, chatId,
          `Сбросить набор (${context.fileNames.length} файл., ${context.variants.length} вар.)?`,
          [[
            { text: '✅ Да', callback_data: `${ACTION_CALLBACK_PREFIX}reset_yes` },
            { text: '❌ Отмена', callback_data: `${ACTION_CALLBACK_PREFIX}menu` },
          ]],
        );
        return;
      }

      if (action === 'reset_yes') {
        chatNestingContext.delete(chatId);
        await telegramSendMessage(token, chatId, 'Набор сброшен. Отправьте DXF файл.');
        return;
      }

      // ── Экспорт ──

      if (action === 'export_dxf' || action === 'export_csv') {
        const activeVariant = getActiveVariant(context);
        if (activeVariant === null) {
          await telegramSendMessage(token, chatId, 'Сначала запустите раскладку.');
          return;
        }
        const safe = toSafeBaseName(getPrimaryFileLabel(context));
        if (action === 'export_dxf') {
          const dxf = exportNestingToDXF({ nestingResult: activeVariant.nesting });
          await telegramSendDocument(token, chatId, Buffer.from(dxf, 'utf-8'), `${safe}-${activeVariant.name}.dxf`, `DXF (${activeVariant.name})`, 'application/dxf');
        } else {
          const csv = exportNestingToCSV({ nestingResult: activeVariant.nesting, fileName: `${safe}-${activeVariant.name}` });
          await telegramSendDocument(token, chatId, Buffer.from(csv, 'utf-8'), `${safe}-${activeVariant.name}.csv`, `CSV (${activeVariant.name})`, 'text/csv');
        }
        return;
      }

      await telegramSendMessage(token, chatId, 'Команда не распознана.');
      return;
    }

    const sheet = getSheetFromCallbackData(data);
    if (sheet === null) {
      await telegramSendMessage(token, chatId, 'Не понял размер листа. Выберите пресет кнопкой ниже.');
      await telegramSendMessageWithKeyboard(token, chatId, 'Выберите размер листа:', buildSheetButtons());
      return;
    }

    if (context === undefined) {
      await telegramSendMessage(token, chatId, 'Сначала отправьте DXF файл.');
      return;
    }

    const nextContext: PendingNestingContext = {
      ...context,
      sheet,
      awaitingInput: 'none',
    };
    chatNestingContext.set(chatId, nextContext);
    await sendSettings(token, chatId, nextContext);
    return;
  }

  const message = update.message;
  if (message === undefined) return;
  const chatId = message.chat.id;

  if (message.document !== undefined) {
    const fileName = message.document.file_name ?? 'file.dxf';
    const isDXF = fileName.toLowerCase().endsWith('.dxf')
      || (message.document.mime_type ?? '').toLowerCase().includes('dxf');

    if (!isDXF) {
      await telegramSendMessage(token, chatId, 'Пришлите DXF файл (.dxf).');
      return;
    }

    await telegramSendMessage(token, chatId, 'Файл получен, обрабатываю...');

    try {
      const dxfBuffer = await downloadTelegramFile(token, message.document.file_id);
      const result = analyzeDXF(dxfBuffer);
      const defaultSheet = SHEET_PRESETS[1]?.size ?? SHEET_PRESETS[0]!.size;
      const current = chatNestingContext.get(chatId);
      const context: PendingNestingContext = current === undefined
        ? {
            fileNames: [fileName],
            summary: result.summary,
            items: result.nestingItems,
            nextItemId: result.nestingItems.length + 1,
            quantity: 1,
            sheet: { ...defaultSheet },
            gap: 5,
            mode: 'precise',
            previewJpeg: result.previewJpeg,
            lastNesting: null,
            variants: [],
            activeVariantIndex: null,
            awaitingInput: 'none',
          }
        : appendAnalysisToContext(current, fileName, result);

      chatNestingContext.set(chatId, context);

      const caption = [
        `Файл: ${fileName}`,
        `Врезок: ${result.summary.totalPierces}`,
        `Длина реза: ${formatCutLength(result.summary.totalCutLength, 'm')}`,
        current === undefined
          ? 'Открываю рабочее меню ниже.'
          : `Добавлен в набор. Теперь файлов в наборе: ${context.fileNames.length}`,
      ].join('\n');

      await telegramSendPhoto(token, chatId, result.previewJpeg, caption);
      await sendDashboard(token, chatId, context);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      await telegramSendMessage(token, chatId, `Ошибка обработки DXF: ${details}`);
    }

    return;
  }

  if (message.text !== undefined) {
    const pending = chatNestingContext.get(chatId);
    if (pending !== undefined && pending.awaitingInput === 'quantity') {
      if (!isPositiveIntegerText(message.text)) {
        await telegramSendMessage(token, chatId, 'Введите целое число больше 0. Например: 5');
        return;
      }

      const quantity = Number(message.text.trim());
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await telegramSendMessage(token, chatId, 'Введите целое число больше 0. Например: 5');
        return;
      }

      chatNestingContext.set(chatId, {
        ...pending,
        quantity,
        awaitingInput: 'none',
      });

      await sendSettings(token, chatId, chatNestingContext.get(chatId)!);
      return;
    }

    if (pending !== undefined && pending.awaitingInput === 'custom_sheet') {
      const sheet = parseSheetSizeText(message.text);
      if (sheet === null) {
        await telegramSendMessage(token, chatId, 'Неверный формат. Введите так: 1500x3000');
        return;
      }

      chatNestingContext.set(chatId, {
        ...pending,
        sheet,
        awaitingInput: 'none',
      });

      await sendSettings(token, chatId, chatNestingContext.get(chatId)!);
      return;
    }

    if (message.text === '/start' || message.text === '/help' || message.text === '/menu') {
      if (pending !== undefined) {
        await sendDashboard(token, chatId, pending);
      } else {
        await telegramSendMessage(
          token,
          chatId,
          'Отправьте DXF файл (.dxf). После загрузки откроется полное меню: статистика, параметры, раскладка и экспорт.',
        );
      }
      return;
    }

    await telegramSendMessage(
      token,
      chatId,
      pending !== undefined
        ? 'Используйте /menu для панели действий или отправьте новый DXF файл.'
        : 'Отправьте DXF файл (.dxf). После загрузки откроется полное меню: статистика, параметры, раскладка и экспорт.',
    );
  }
}

export async function startTelegramBotPolling(token: string): Promise<void> {
  let offset = 0;
  const timeout = Number(process.env.TELEGRAM_POLL_TIMEOUT_SEC ?? '30');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await telegramGet<readonly TelegramUpdate[]>(token, 'getUpdates', {
        timeout: String(timeout),
        offset: String(offset),
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(token, update);
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      console.error('[BotService] polling error:', details);
      await sleep(2500);
    }
  }
}

/**
 * API-level обработка текстового сообщения (без Telegram polling).
 */
export async function processBotMessage(message: BotMessage): Promise<BotResponse> {
  console.log('[BotService] Received message:', message.text);

  return {
    success: true,
    message: 'Bot service is active. For DXF analysis send a .dxf file to Telegram bot.',
  };
}

/**
 * Заглушка legacy API.
 */
export async function sendBotMessage(chatId: string, text: string): Promise<BotResponse> {
  console.log('[BotService] Would send message to', chatId, ':', text);

  return {
    success: true,
    message: 'Use Telegram polling runner for outbound delivery.',
  };
}

/**
 * Проверяет, является ли сообщение командой бота.
 */
export function isBotCommand(text: string): boolean {
  return text.startsWith('/');
}

/**
 * Извлекает команду из текста сообщения.
 */
export function extractCommand(text: string): { command: string; args: string } | null {
  const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (!match) return null;
  
  return {
    command: match[1]!,
    args: match[2] || '',
  };
}
