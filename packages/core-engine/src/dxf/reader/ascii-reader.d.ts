/**
 * @module core/dxf/reader/ascii-reader
 * Парсер ASCII DXF файлов.
 * Читает пары код-значение и разбивает на секции.
 */
import { type DXFGroup, type DXFSection, type GroupCode, type DXFValue } from '../../types/index.js';
/**
 * Определяет тип значения по коду группы DXF.
 * Согласно спецификации DXF:
 * - 0-9: строка
 * - 10-39: double (координаты)
 * - 40-59: double
 * - 60-79: int16
 * - 90-99: int32
 * - 100: строка (подкласс)
 * - 102: строка
 * - 105: строка (handle)
 * - 110-149: double
 * - 160-169: int64
 * - 170-179: int16
 * - 210-239: double
 * - 270-289: int16
 * - 290-299: boolean
 * - 300-369: строка
 * - 370-389: int16
 * - 390-399: строка (handle)
 * - 400-409: int16
 * - 410-419: строка
 * - 420-429: int32
 * - 430-439: строка
 * - 440-449: int32
 * - 450-459: int32
 * - 460-469: double
 * - 470-479: строка
 * - 480-481: строка (handle)
 * - 999: строка (комментарий)
 * - 1000-1009: строка
 * - 1010-1059: double
 * - 1060-1070: int16
 * - 1071: int32
 *
 * @param code - Код группы DXF
 * @returns Тип значения: 'string' | 'double' | 'int16' | 'int32' | 'int64' | 'boolean'
 */
export declare function getValueType(code: GroupCode): 'string' | 'double' | 'int16' | 'int32' | 'int64' | 'boolean';
/**
 * Парсит строковое значение в типизированное значение DXF.
 * @param code - Код группы
 * @param raw - Сырое строковое значение
 * @returns Типизированное значение
 */
export declare function parseValue(code: GroupCode, raw: string): DXFValue;
/**
 * Разбивает текст ASCII DXF на пары код-значение.
 * @param text - Полный текст DXF файла
 * @returns Массив пар код-значение
 * @throws DXFError при ошибке парсинга
 */
export declare function parseGroups(text: string): DXFGroup[];
/**
 * Разбивает массив групп на секции DXF.
 * Секции начинаются с (0, SECTION) и заканчиваются (0, ENDSEC).
 * @param groups - Массив пар код-значение
 * @returns Массив секций
 * @throws DXFError при ошибке структуры
 */
export declare function parseSections(groups: DXFGroup[]): DXFSection[];
/**
 * Полный парсинг ASCII DXF текста в массив секций.
 * @param text - Полный текст DXF файла
 * @returns Массив секций DXF
 */
export declare function parseAsciiDXF(text: string): DXFSection[];
//# sourceMappingURL=ascii-reader.d.ts.map