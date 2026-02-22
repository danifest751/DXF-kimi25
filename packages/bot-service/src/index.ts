/**
 * @module bot-service
 * Telegram bot service.
 * Принимает DXF, считает врезки/длину реза и отправляет JPEG-превью.
 */

import jpeg from 'jpeg-js';
import { parseDXF } from '../../core-engine/src/dxf/reader/index.js';
import { normalizeDocument, type FlattenedEntity, type NormalizedDocument } from '../../core-engine/src/normalize/index.js';
import { computeCuttingStats, formatCutLength } from '../../core-engine/src/cutting/index.js';
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
}

interface TelegramFile {
  readonly file_path: string;
}

interface BotCuttingSummary {
  readonly totalPierces: number;
  readonly totalCutLength: number;
}

const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 720;
const PREVIEW_PADDING = 28;

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

function analyzeDXF(buffer: Buffer): { previewJpeg: Buffer; summary: BotCuttingSummary } {
  const doc = parseDXF(toArrayBuffer(buffer));
  const normalized = normalizeDocument(doc);
  const stats = computeCuttingStats(normalized);

  return {
    previewJpeg: renderPreview(normalized),
    summary: {
      totalPierces: stats.totalPierces,
      totalCutLength: stats.totalCutLength,
    },
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
      const caption = [
        `Файл: ${fileName}`,
        `Врезок: ${result.summary.totalPierces}`,
        `Длина реза: ${formatCutLength(result.summary.totalCutLength, 'm')}`,
      ].join('\n');

      await telegramSendPhoto(token, chatId, result.previewJpeg, caption);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      await telegramSendMessage(token, chatId, `Ошибка обработки DXF: ${details}`);
    }

    return;
  }

  if (message.text !== undefined) {
    await telegramSendMessage(token, chatId, 'Отправьте DXF файл, и я верну JPEG-превью + врезки и длину реза.');
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
