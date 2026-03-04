/**
 * @module types
 * Shared UI types for the DXF Viewer application.
 */

import type { NormalizedDocument } from '../../core-engine/src/normalize/index.js';
import type { Point3D } from '../../core-engine/src/types/index.js';

export interface UICuttingChain {
  readonly piercePoint: Point3D;
}

export interface UICuttingStats {
  readonly totalPierces: number;
  readonly totalCutLength: number;
  readonly cuttingEntityCount: number;
  readonly chains: readonly UICuttingChain[];
}

export interface WorkspaceCatalog {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LoadedFile {
  id: number;
  remoteId: string;
  workspaceId: string;
  catalogId: string | null;
  name: string;
  localBase64?: string;
  doc: NormalizedDocument;
  stats: UICuttingStats;
  checked: boolean;
  quantity: number;
  /** true пока DXF ещё скачивается/парсится (lazy load из библиотеки) */
  loading?: boolean;
  /** Promise, который резолвится когда загрузка завершена */
  loadPromise?: Promise<void>;
  /** Сообщение об ошибке загрузки */
  loadError?: string;
  /** Размер файла в байтах */
  sizeBytes?: number;
}

export type ComputeMode = 'api' | 'local';
