/**
 * @module core/dxf/reader
 * Главный модуль чтения DXF файлов.
 * Определяет формат (ASCII/Binary) и делегирует парсинг.
 */

import {
  type DXFDocument,
  type DXFSection,
  DXFFormat,
} from '../../types/index.js';
import { parseAsciiDXF } from './ascii-reader.js';
import { isBinaryDXF, parseBinaryDXF } from './binary-reader.js';
import { parseEntitiesSection } from './entity-parser.js';
import {
  parseHeaderSection,
  parseTablesSection,
  parseBlocksSection,
  extractMetadata,
} from './section-parser.js';

export { parseAsciiDXF } from './ascii-reader.js';
export { parseBinaryDXF, isBinaryDXF } from './binary-reader.js';
export { parseEntity, parseEntitiesSection, aciToColor } from './entity-parser.js';
export {
  parseHeaderSection,
  parseTablesSection,
  parseBlocksSection,
  extractMetadata,
} from './section-parser.js';

/**
 * Определяет формат DXF файла.
 * @param buffer - ArrayBuffer с содержимым файла
 * @returns Формат файла
 */
export function detectFormat(buffer: ArrayBuffer): DXFFormat {
  if (isBinaryDXF(buffer)) {
    return DXFFormat.BINARY;
  }
  return DXFFormat.ASCII;
}

/**
 * Парсит DXF файл из ArrayBuffer в полную модель документа.
 * Автоматически определяет формат (ASCII/Binary).
 * @param buffer - ArrayBuffer с содержимым файла
 * @returns Полная модель DXF документа
 * @throws DXFError при ошибке парсинга
 */
export function parseDXF(buffer: ArrayBuffer): DXFDocument {
  const format = detectFormat(buffer);
  let sections: DXFSection[];

  if (format === DXFFormat.BINARY) {
    sections = parseBinaryDXF(buffer);
  } else {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);
    sections = parseAsciiDXF(text);
  }

  return buildDocument(sections, format);
}

/**
 * Парсит DXF файл из строки (только ASCII).
 * @param text - Текст DXF файла
 * @returns Полная модель DXF документа
 * @throws DXFError при ошибке парсинга
 */
export function parseDXFFromString(text: string): DXFDocument {
  const sections = parseAsciiDXF(text);
  return buildDocument(sections, DXFFormat.ASCII);
}

/**
 * Собирает DXFDocument из массива секций.
 * @param sections - Массив секций DXF
 * @param format - Формат файла
 * @returns Полная модель DXF документа
 */
function buildDocument(sections: DXFSection[], format: DXFFormat): DXFDocument {
  // Находим секции
  const headerSection = sections.find((s) => s.name === 'HEADER');
  const tablesSection = sections.find((s) => s.name === 'TABLES');
  const blocksSection = sections.find((s) => s.name === 'BLOCKS');
  const entitiesSection = sections.find((s) => s.name === 'ENTITIES');

  // Парсим заголовок
  const header = headerSection
    ? parseHeaderSection(headerSection)
    : new Map();

  // Парсим таблицы
  const tables = tablesSection
    ? parseTablesSection(tablesSection)
    : {
        layers: new Map(),
        lineTypes: new Map(),
        textStyles: new Map(),
        dimStyles: new Map(),
      };

  // Парсим блоки
  const blocks = blocksSection
    ? parseBlocksSection(blocksSection)
    : new Map();

  // Парсим сущности
  const entities = entitiesSection
    ? parseEntitiesSection(entitiesSection.groups)
    : [];

  // Собираем метаданные
  const metadata = extractMetadata(
    header,
    format,
    entities.length,
    tables.layers.size,
    blocks.size,
  );

  return {
    metadata,
    layers: tables.layers,
    lineTypes: tables.lineTypes,
    textStyles: tables.textStyles,
    dimStyles: tables.dimStyles,
    blocks,
    entities,
    header,
  };
}
