/**
 * @module core/workers
 * Менеджер Web Worker для парсинга DXF.
 */
import { WorkerMessageType } from '../types/index.js';
/**
 * Парсит DXF файл в Web Worker.
 * @param buffer - ArrayBuffer с содержимым файла
 * @param callbacks - Колбэки прогресса/завершения/ошибки
 * @returns Promise с результатом парсинга
 */
export function parseDXFInWorker(buffer, callbacks) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./dxf-worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => {
            const msg = event.data;
            switch (msg.type) {
                case WorkerMessageType.PARSE_PROGRESS:
                    callbacks?.onProgress?.(msg.data);
                    break;
                case WorkerMessageType.PARSE_COMPLETE: {
                    const normalized = deserializeNormalizedDoc(msg.data);
                    const result = { document: normalized };
                    callbacks?.onComplete?.(result);
                    resolve(result);
                    worker.terminate();
                    break;
                }
                case WorkerMessageType.PARSE_ERROR: {
                    const errData = msg.data;
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
        const msg = {
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
export async function parseDXFSync(buffer) {
    const { parseDXF } = await import('../dxf/reader/index.js');
    const { normalizeDocument } = await import('../normalize/index.js');
    const doc = parseDXF(buffer);
    const normalized = normalizeDocument(doc);
    return { document: normalized };
}
/**
 * Десериализует NormalizedDocument из plain object (из воркера).
 */
function deserializeNormalizedDoc(data) {
    const raw = data;
    const source = {
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
//# sourceMappingURL=index.js.map