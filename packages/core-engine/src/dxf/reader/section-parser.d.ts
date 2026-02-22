/**
 * @module core/dxf/reader/section-parser
 * Парсер секций HEADER, TABLES, BLOCKS DXF файла.
 */
import { type DXFGroup, type DXFSection, type DXFLayer, type LineType, type TextStyle, type DimStyle, type DXFBlock, type DXFValue, type DXFMetadata, DXFFormat } from '../../types/index.js';
/**
 * Парсит секцию HEADER.
 * Извлекает переменные заголовка ($ACADVER, $EXTMIN, $EXTMAX и т.д.)
 * @param section - Секция HEADER
 * @returns Map переменных заголовка
 */
export declare function parseHeaderSection(section: DXFSection): Map<string, DXFValue>;
/**
 * Извлекает метаданные из заголовка.
 * @param header - Map переменных заголовка
 * @param format - Формат файла (ASCII/BINARY)
 * @param entityCount - Количество сущностей
 * @param layerCount - Количество слоёв
 * @param blockCount - Количество блоков
 * @returns Метаданные DXF
 */
export declare function extractMetadata(header: Map<string, DXFValue>, format: DXFFormat, entityCount: number, layerCount: number, blockCount: number): DXFMetadata;
/**
 * Парсит таблицу LAYER из секции TABLES.
 * @param groups - Группы таблицы LAYER
 * @returns Map слоёв
 */
export declare function parseLayerTable(groups: readonly DXFGroup[]): Map<string, DXFLayer>;
/**
 * Парсит таблицу LTYPE из секции TABLES.
 * @param groups - Группы таблицы LTYPE
 * @returns Map типов линий
 */
export declare function parseLineTypeTable(groups: readonly DXFGroup[]): Map<string, LineType>;
/**
 * Парсит таблицу STYLE из секции TABLES.
 * @param groups - Группы таблицы STYLE
 * @returns Map стилей текста
 */
export declare function parseTextStyleTable(groups: readonly DXFGroup[]): Map<string, TextStyle>;
/**
 * Парсит таблицу DIMSTYLE из секции TABLES.
 * @param groups - Группы таблицы DIMSTYLE
 * @returns Map стилей размеров
 */
export declare function parseDimStyleTable(groups: readonly DXFGroup[]): Map<string, DimStyle>;
/**
 * Парсит секцию TABLES.
 * Извлекает таблицы LAYER, LTYPE, STYLE, DIMSTYLE.
 * @param section - Секция TABLES
 * @returns Объект с таблицами
 */
export declare function parseTablesSection(section: DXFSection): {
    layers: Map<string, DXFLayer>;
    lineTypes: Map<string, LineType>;
    textStyles: Map<string, TextStyle>;
    dimStyles: Map<string, DimStyle>;
};
/**
 * Парсит секцию BLOCKS.
 * @param section - Секция BLOCKS
 * @returns Map блоков
 */
export declare function parseBlocksSection(section: DXFSection): Map<string, DXFBlock>;
//# sourceMappingURL=section-parser.d.ts.map