/**
 * @module core/dxf/reader/entity-parser
 * Парсер DXF-сущностей из пар код-значение.
 * Преобразует сырые группы в типизированные сущности.
 */
import { type DXFGroup, type DXFEntity, type Color } from '../../types/index.js';
/**
 * Преобразует ACI (AutoCAD Color Index) в RGB.
 * Упрощённая таблица для основных цветов.
 * @param index - ACI индекс (0-255)
 * @returns RGB цвет
 */
export declare function aciToColor(index: number): Color;
/**
 * Парсит одну сущность из массива групп.
 * @param entityName - Имя типа сущности (из группы с кодом 0)
 * @param groups - Группы, принадлежащие этой сущности
 * @returns Типизированная сущность или null если тип не поддерживается
 */
export declare function parseEntity(entityName: string, groups: DXFGroup[]): DXFEntity | null;
/**
 * Парсит секцию ENTITIES в массив типизированных сущностей.
 * Разбивает группы на блоки по маркерам (код 0).
 * @param sectionGroups - Группы из секции ENTITIES
 * @returns Массив типизированных сущностей
 */
export declare function parseEntitiesSection(sectionGroups: readonly DXFGroup[]): DXFEntity[];
//# sourceMappingURL=entity-parser.d.ts.map