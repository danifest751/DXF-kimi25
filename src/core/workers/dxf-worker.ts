/**
 * @module core/workers/dxf-worker
 * Web Worker для парсинга DXF файлов в фоновом потоке.
 */

import { parseDXF } from '../dxf/reader/index.js';
import { normalizeDocument } from '../normalize/index.js';
import { WorkerMessageType } from '../types/index.js';
import type { WorkerMessage, ParseProgress } from '../types/index.js';

function postMsg<T>(type: WorkerMessageType, data: T): void {
  const msg: WorkerMessage<T> = { type, data, timestamp: Date.now() };
  self.postMessage(msg);
}

self.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data as WorkerMessage;

  if (type === WorkerMessageType.PARSE_START) {
    const buffer = data as ArrayBuffer;

    try {
      postMsg<ParseProgress>(WorkerMessageType.PARSE_PROGRESS, {
        bytesProcessed: 0,
        totalBytes: buffer.byteLength,
        entitiesParsed: 0,
        currentSection: 'INIT',
      });

      // Парсим DXF
      const doc = parseDXF(buffer);

      postMsg<ParseProgress>(WorkerMessageType.PARSE_PROGRESS, {
        bytesProcessed: buffer.byteLength,
        totalBytes: buffer.byteLength,
        entitiesParsed: doc.entities.length,
        currentSection: 'NORMALIZE',
      });

      // Нормализуем
      const normalized = normalizeDocument(doc);

      // Отправляем результат
      // NormalizedDocument содержит Map и другие не-transferable объекты,
      // поэтому сериализуем в plain object
      const serialized = serializeNormalizedDoc(normalized);

      postMsg(WorkerMessageType.PARSE_COMPLETE, serialized);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postMsg(WorkerMessageType.PARSE_ERROR, { message });
    }
  }
};

/**
 * Сериализует NormalizedDocument для передачи через postMessage.
 * Map → Object, Set → Array.
 */
function serializeNormalizedDoc(doc: ReturnType<typeof normalizeDocument>): unknown {
  return {
    source: {
      metadata: doc.source.metadata,
      layers: Object.fromEntries(doc.source.layers),
      lineTypes: Object.fromEntries(doc.source.lineTypes),
      textStyles: Object.fromEntries(doc.source.textStyles),
      dimStyles: Object.fromEntries(doc.source.dimStyles),
      blocks: Object.fromEntries(
        Array.from(doc.source.blocks.entries()).map(([k, v]) => [k, {
          name: v.name,
          basePoint: v.basePoint,
          entities: v.entities,
          endBlk: v.endBlk,
        }]),
      ),
      entities: doc.source.entities,
      header: Object.fromEntries(doc.source.header),
    },
    flatEntities: doc.flatEntities,
    totalBBox: doc.totalBBox,
    layerNames: doc.layerNames,
    entityCount: doc.entityCount,
  };
}
