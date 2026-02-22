/**
 * @module core/workers
 * Менеджер Web Worker для парсинга DXF.
 */

import type {
  WorkerMessage,
  ParseProgress,
  DXFDocument,
  DXFLayer,
  LineType,
  TextStyle,
  DimStyle,
  DXFBlock,
  DXFValue,
  DXFEntity,
  BoundingBox,
} from '../types/index.js';
import { WorkerMessageType } from '../types/index.js';
import type { NormalizedDocument, FlattenedEntity } from '../normalize/index.js';

export interface ParseResult {
  readonly document: NormalizedDocument;
}

export interface ParseCallbacks {
  onProgress?: (progress: ParseProgress) => void;
  onComplete?: (result: ParseResult) => void;
  onError?: (error: string) => void;
}

/**
 * Парсит DXF файл в Web Worker.
 * @param buffer - ArrayBuffer с содержимым файла
 * @param callbacks - Колбэки прогресса/завершения/ошибки
 * @returns Promise с результатом парсинга
 */
export function parseDXFInWorker(
  buffer: ArrayBuffer,
  callbacks?: ParseCallbacks,
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./dxf-worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case WorkerMessageType.PARSE_PROGRESS:
          callbacks?.onProgress?.(msg.data as ParseProgress);
          break;

        case WorkerMessageType.PARSE_COMPLETE: {
          const normalized = deserializeNormalizedDoc(msg.data);
          const result: ParseResult = { document: normalized };
          callbacks?.onComplete?.(result);
          resolve(result);
          worker.terminate();
          break;
        }

        case WorkerMessageType.PARSE_ERROR: {
          const errData = msg.data as { message: string };
          callbacks?.onError?.(errData.message);
          reject(new Error(errData.message));
          worker.terminate();
          break;
        }
      }
    };

    worker.onerror = (event) => {
      const message = event.message || 'Worker error';
      callbacks?.onError?.(message);
      reject(new Error(message));
      worker.terminate();
    };

    // Отправляем буфер в воркер (transferable)
    const msg: WorkerMessage<ArrayBuffer> = {
      type: WorkerMessageType.PARSE_START,
      data: buffer,
      timestamp: Date.now(),
    };
    worker.postMessage(msg, [buffer]);
  });
}

/**
 * Синхронный парсинг DXF (без воркера, для малых файлов или fallback).
 */
export async function parseDXFSync(buffer: ArrayBuffer): Promise<ParseResult> {
  const { parseDXF } = await import('../dxf/reader/index.js');
  const { normalizeDocument } = await import('../normalize/index.js');
  const doc = parseDXF(buffer);
  const normalized = normalizeDocument(doc);
  return { document: normalized };
}

/**
 * Десериализует NormalizedDocument из plain object (из воркера).
 */
function deserializeNormalizedDoc(data: unknown): NormalizedDocument {
  const raw = data as {
    source: {
      metadata: DXFDocument['metadata'];
      layers: Record<string, DXFLayer>;
      lineTypes: Record<string, LineType>;
      textStyles: Record<string, TextStyle>;
      dimStyles: Record<string, DimStyle>;
      blocks: Record<string, DXFBlock>;
      entities: DXFEntity[];
      header: Record<string, DXFValue>;
    };
    flatEntities: FlattenedEntity[];
    totalBBox: BoundingBox | null;
    layerNames: string[];
    entityCount: number;
  };

  const source: DXFDocument = {
    metadata: raw.source.metadata,
    layers: new Map(Object.entries(raw.source.layers)),
    lineTypes: new Map(Object.entries(raw.source.lineTypes)),
    textStyles: new Map(Object.entries(raw.source.textStyles)),
    dimStyles: new Map(Object.entries(raw.source.dimStyles)),
    blocks: new Map(Object.entries(raw.source.blocks)),
    entities: raw.source.entities,
    header: new Map(Object.entries(raw.source.header)),
  };

  return {
    source,
    flatEntities: raw.flatEntities,
    totalBBox: raw.totalBBox,
    layerNames: raw.layerNames,
    entityCount: raw.entityCount,
  };
}
