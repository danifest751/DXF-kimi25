/**
 * @module core/dxf/reader/section-parser
 * Парсер секций HEADER, TABLES, BLOCKS DXF файла.
 */

import {
  type DXFGroup,
  type DXFSection,
  type DXFLayer,
  type LineType,
  type TextStyle,
  type DimStyle,
  type DXFBlock,
  type DXFValue,
  type DXFVersion,
  type DXFMetadata,
  type BoundingBox,
  DXFFormat,
} from '../../types/index.js';
import { aciToColor, parseEntitiesSection } from './entity-parser.js';

/** Маппинг $ACADVER → DXFVersion */
const VERSION_MAP: Record<string, DXFVersion> = {
  'AC1009': 'R12' as DXFVersion,
  'AC1012': 'R12' as DXFVersion,
  'AC1014': '2000' as DXFVersion,
  'AC1015': '2000' as DXFVersion,
  'AC1018': '2004' as DXFVersion,
  'AC1021': '2007' as DXFVersion,
  'AC1024': '2010' as DXFVersion,
  'AC1027': '2013' as DXFVersion,
  'AC1032': '2018' as DXFVersion,
};

/**
 * Парсит секцию HEADER.
 * Извлекает переменные заголовка ($ACADVER, $EXTMIN, $EXTMAX и т.д.)
 * @param section - Секция HEADER
 * @returns Map переменных заголовка
 */
export function parseHeaderSection(section: DXFSection): Map<string, DXFValue> {
  const header = new Map<string, DXFValue>();
  let currentVar: string | null = null;

  for (const group of section.groups) {
    if (group.code === 9) {
      currentVar = String(group.value);
    } else if (currentVar !== null) {
      header.set(currentVar, group.value);
      // Не сбрасываем currentVar — следующие группы могут быть частью той же переменной
      // (например, $EXTMIN имеет коды 10, 20, 30)
      if (group.code === 1 || group.code === 2 || group.code === 3 ||
          group.code === 7 || group.code === 70 || group.code === 40) {
        // Простые значения — сбрасываем
      }
      // Для координатных переменных сохраняем с суффиксом
      if (group.code === 10) header.set(`${currentVar}.x`, group.value);
      if (group.code === 20) header.set(`${currentVar}.y`, group.value);
      if (group.code === 30) header.set(`${currentVar}.z`, group.value);
    }
  }

  return header;
}

/**
 * Извлекает метаданные из заголовка.
 * @param header - Map переменных заголовка
 * @param format - Формат файла (ASCII/BINARY)
 * @param entityCount - Количество сущностей
 * @param layerCount - Количество слоёв
 * @param blockCount - Количество блоков
 * @returns Метаданные DXF
 */
export function extractMetadata(
  header: Map<string, DXFValue>,
  format: DXFFormat,
  entityCount: number,
  layerCount: number,
  blockCount: number,
): DXFMetadata {
  const acadVer = String(header.get('$ACADVER') ?? 'AC1009');
  const version = VERSION_MAP[acadVer] ?? ('R12' as DXFVersion);

  const extents: BoundingBox = {
    min: {
      x: Number(header.get('$EXTMIN.x') ?? 0),
      y: Number(header.get('$EXTMIN.y') ?? 0),
      z: Number(header.get('$EXTMIN.z') ?? 0),
    },
    max: {
      x: Number(header.get('$EXTMAX.x') ?? 0),
      y: Number(header.get('$EXTMAX.y') ?? 0),
      z: Number(header.get('$EXTMAX.z') ?? 0),
    },
  };

  return {
    format,
    version,
    handle: String(header.get('$HANDSEED') ?? '0'),
    units: Number(header.get('$INSUNITS') ?? 0),
    extents,
    entityCount,
    layerCount,
    blockCount,
  };
}

/**
 * Парсит таблицу LAYER из секции TABLES.
 * @param groups - Группы таблицы LAYER
 * @returns Map слоёв
 */
export function parseLayerTable(groups: readonly DXFGroup[]): Map<string, DXFLayer> {
  const layers = new Map<string, DXFLayer>();
  let currentGroups: DXFGroup[] = [];
  let inEntry = false;

  for (const group of groups) {
    if (group.code === 0 && group.value === 'LAYER') {
      if (inEntry && currentGroups.length > 0) {
        const layer = parseLayerEntry(currentGroups);
        if (layer !== null) {
          layers.set(layer.name, layer);
        }
      }
      currentGroups = [];
      inEntry = true;
    } else if (group.code === 0) {
      if (inEntry && currentGroups.length > 0) {
        const layer = parseLayerEntry(currentGroups);
        if (layer !== null) {
          layers.set(layer.name, layer);
        }
      }
      currentGroups = [];
      inEntry = false;
    } else if (inEntry) {
      currentGroups.push(group);
    }
  }

  // Последняя запись
  if (inEntry && currentGroups.length > 0) {
    const layer = parseLayerEntry(currentGroups);
    if (layer !== null) {
      layers.set(layer.name, layer);
    }
  }

  return layers;
}

/** Парсит одну запись слоя */
function parseLayerEntry(groups: DXFGroup[]): DXFLayer | null {
  const name = groups.find((g) => g.code === 2);
  if (name === undefined) return null;

  const colorIndex = Number(groups.find((g) => g.code === 62)?.value ?? 7);
  const flags = Number(groups.find((g) => g.code === 70)?.value ?? 0);

  return {
    name: String(name.value),
    color: aciToColor(Math.abs(colorIndex)),
    lineType: String(groups.find((g) => g.code === 6)?.value ?? 'Continuous'),
    lineWeight: Number(groups.find((g) => g.code === 370)?.value ?? -1),
    frozen: (flags & 1) !== 0,
    locked: (flags & 4) !== 0,
    visible: colorIndex >= 0, // Отрицательный цвет = слой выключен
  };
}

/**
 * Парсит таблицу LTYPE из секции TABLES.
 * @param groups - Группы таблицы LTYPE
 * @returns Map типов линий
 */
export function parseLineTypeTable(groups: readonly DXFGroup[]): Map<string, LineType> {
  const lineTypes = new Map<string, LineType>();
  let currentGroups: DXFGroup[] = [];
  let inEntry = false;

  for (const group of groups) {
    if (group.code === 0 && group.value === 'LTYPE') {
      if (inEntry && currentGroups.length > 0) {
        const lt = parseLineTypeEntry(currentGroups);
        if (lt !== null) {
          lineTypes.set(lt.name, lt);
        }
      }
      currentGroups = [];
      inEntry = true;
    } else if (group.code === 0) {
      if (inEntry && currentGroups.length > 0) {
        const lt = parseLineTypeEntry(currentGroups);
        if (lt !== null) {
          lineTypes.set(lt.name, lt);
        }
      }
      currentGroups = [];
      inEntry = false;
    } else if (inEntry) {
      currentGroups.push(group);
    }
  }

  if (inEntry && currentGroups.length > 0) {
    const lt = parseLineTypeEntry(currentGroups);
    if (lt !== null) {
      lineTypes.set(lt.name, lt);
    }
  }

  return lineTypes;
}

/** Парсит одну запись типа линии */
function parseLineTypeEntry(groups: DXFGroup[]): LineType | null {
  const name = groups.find((g) => g.code === 2);
  if (name === undefined) return null;

  const pattern = groups
    .filter((g) => g.code === 49)
    .map((g) => Number(g.value));

  return {
    name: String(name.value),
    description: String(groups.find((g) => g.code === 3)?.value ?? ''),
    pattern,
    scale: Number(groups.find((g) => g.code === 40)?.value ?? 1),
  };
}

/**
 * Парсит таблицу STYLE из секции TABLES.
 * @param groups - Группы таблицы STYLE
 * @returns Map стилей текста
 */
export function parseTextStyleTable(groups: readonly DXFGroup[]): Map<string, TextStyle> {
  const styles = new Map<string, TextStyle>();
  let currentGroups: DXFGroup[] = [];
  let inEntry = false;

  for (const group of groups) {
    if (group.code === 0 && group.value === 'STYLE') {
      if (inEntry && currentGroups.length > 0) {
        const style = parseTextStyleEntry(currentGroups);
        if (style !== null) {
          styles.set(style.name, style);
        }
      }
      currentGroups = [];
      inEntry = true;
    } else if (group.code === 0) {
      if (inEntry && currentGroups.length > 0) {
        const style = parseTextStyleEntry(currentGroups);
        if (style !== null) {
          styles.set(style.name, style);
        }
      }
      currentGroups = [];
      inEntry = false;
    } else if (inEntry) {
      currentGroups.push(group);
    }
  }

  if (inEntry && currentGroups.length > 0) {
    const style = parseTextStyleEntry(currentGroups);
    if (style !== null) {
      styles.set(style.name, style);
    }
  }

  return styles;
}

/** Парсит одну запись стиля текста */
function parseTextStyleEntry(groups: DXFGroup[]): TextStyle | null {
  const name = groups.find((g) => g.code === 2);
  if (name === undefined) return null;

  return {
    name: String(name.value),
    font: String(groups.find((g) => g.code === 3)?.value ?? 'txt'),
    height: Number(groups.find((g) => g.code === 40)?.value ?? 0),
    width: Number(groups.find((g) => g.code === 41)?.value ?? 1),
    obliqueAngle: Number(groups.find((g) => g.code === 50)?.value ?? 0),
  };
}

/**
 * Парсит таблицу DIMSTYLE из секции TABLES.
 * @param groups - Группы таблицы DIMSTYLE
 * @returns Map стилей размеров
 */
export function parseDimStyleTable(groups: readonly DXFGroup[]): Map<string, DimStyle> {
  const dimStyles = new Map<string, DimStyle>();
  let currentGroups: DXFGroup[] = [];
  let inEntry = false;

  for (const group of groups) {
    if (group.code === 0 && group.value === 'DIMSTYLE') {
      if (inEntry && currentGroups.length > 0) {
        const ds = parseDimStyleEntry(currentGroups);
        if (ds !== null) {
          dimStyles.set(ds.name, ds);
        }
      }
      currentGroups = [];
      inEntry = true;
    } else if (group.code === 0) {
      if (inEntry && currentGroups.length > 0) {
        const ds = parseDimStyleEntry(currentGroups);
        if (ds !== null) {
          dimStyles.set(ds.name, ds);
        }
      }
      currentGroups = [];
      inEntry = false;
    } else if (inEntry) {
      currentGroups.push(group);
    }
  }

  if (inEntry && currentGroups.length > 0) {
    const ds = parseDimStyleEntry(currentGroups);
    if (ds !== null) {
      dimStyles.set(ds.name, ds);
    }
  }

  return dimStyles;
}

/** Парсит одну запись стиля размеров */
function parseDimStyleEntry(groups: DXFGroup[]): DimStyle | null {
  const name = groups.find((g) => g.code === 2);
  if (name === undefined) return null;

  return {
    name: String(name.value),
    arrowSize: Number(groups.find((g) => g.code === 41)?.value ?? 2.5),
    textHeight: Number(groups.find((g) => g.code === 140)?.value ?? 2.5),
    extensionLineOffset: Number(groups.find((g) => g.code === 42)?.value ?? 0.625),
  };
}

/**
 * Парсит секцию TABLES.
 * Извлекает таблицы LAYER, LTYPE, STYLE, DIMSTYLE.
 * @param section - Секция TABLES
 * @returns Объект с таблицами
 */
export function parseTablesSection(section: DXFSection): {
  layers: Map<string, DXFLayer>;
  lineTypes: Map<string, LineType>;
  textStyles: Map<string, TextStyle>;
  dimStyles: Map<string, DimStyle>;
} {
  // Разбиваем на подтаблицы по маркерам TABLE/ENDTAB
  const tables: { name: string; groups: DXFGroup[] }[] = [];
  let currentTableName: string | null = null;
  let currentGroups: DXFGroup[] = [];

  for (const group of section.groups) {
    if (group.code === 0 && group.value === 'TABLE') {
      currentGroups = [];
      currentTableName = null;
    } else if (group.code === 2 && currentTableName === null) {
      currentTableName = String(group.value);
    } else if (group.code === 0 && group.value === 'ENDTAB') {
      if (currentTableName !== null) {
        tables.push({ name: currentTableName, groups: currentGroups });
      }
      currentTableName = null;
      currentGroups = [];
    } else if (currentTableName !== null) {
      currentGroups.push(group);
    }
  }

  let layers = new Map<string, DXFLayer>();
  let lineTypes = new Map<string, LineType>();
  let textStyles = new Map<string, TextStyle>();
  let dimStyles = new Map<string, DimStyle>();

  for (const table of tables) {
    switch (table.name) {
      case 'LAYER':
        layers = parseLayerTable(table.groups);
        break;
      case 'LTYPE':
        lineTypes = parseLineTypeTable(table.groups);
        break;
      case 'STYLE':
        textStyles = parseTextStyleTable(table.groups);
        break;
      case 'DIMSTYLE':
        dimStyles = parseDimStyleTable(table.groups);
        break;
    }
  }

  return { layers, lineTypes, textStyles, dimStyles };
}

/**
 * Парсит секцию BLOCKS.
 * @param section - Секция BLOCKS
 * @returns Map блоков
 */
export function parseBlocksSection(section: DXFSection): Map<string, DXFBlock> {
  const blocks = new Map<string, DXFBlock>();
  let currentBlockName: string | null = null;
  let blockBasePoint = { x: 0, y: 0, z: 0 };
  let inBlock = false;
  let entityGroups: DXFGroup[] = [];

  for (const group of section.groups) {
    if (group.code === 0 && group.value === 'BLOCK') {
      inBlock = true;
      entityGroups = [];
      currentBlockName = null;
    } else if (group.code === 0 && group.value === 'ENDBLK') {
      if (currentBlockName !== null) {
        const entities = parseEntitiesSection(entityGroups);
        blocks.set(currentBlockName, {
          name: currentBlockName,
          basePoint: blockBasePoint,
          entities,
          endBlk: { x: 0, y: 0, z: 0 },
        });
      }
      inBlock = false;
      currentBlockName = null;
    } else if (inBlock) {
      if (currentBlockName === null) {
        // Ещё читаем заголовок блока
        if (group.code === 2) {
          currentBlockName = String(group.value);
        } else if (group.code === 10) {
          blockBasePoint = { ...blockBasePoint, x: Number(group.value) };
        } else if (group.code === 20) {
          blockBasePoint = { ...blockBasePoint, y: Number(group.value) };
        } else if (group.code === 30) {
          blockBasePoint = { ...blockBasePoint, z: Number(group.value) };
        }
      } else {
        // Группы сущностей внутри блока
        entityGroups.push(group);
      }
    }
  }

  return blocks;
}
