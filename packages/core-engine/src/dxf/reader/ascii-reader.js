/**
 * @module core/dxf/reader/ascii-reader
 * Парсер ASCII DXF файлов.
 * Читает пары код-значение и разбивает на секции.
 */
import { DXFError, ErrorCode, } from '../../types/index.js';
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
export function getValueType(code) {
    if (code >= 0 && code <= 9)
        return 'string';
    if (code >= 10 && code <= 39)
        return 'double';
    if (code >= 40 && code <= 59)
        return 'double';
    if (code >= 60 && code <= 79)
        return 'int16';
    if (code >= 90 && code <= 99)
        return 'int32';
    if (code === 100)
        return 'string';
    if (code === 102)
        return 'string';
    if (code === 105)
        return 'string';
    if (code >= 110 && code <= 149)
        return 'double';
    if (code >= 160 && code <= 169)
        return 'int64';
    if (code >= 170 && code <= 179)
        return 'int16';
    if (code >= 210 && code <= 239)
        return 'double';
    if (code >= 270 && code <= 289)
        return 'int16';
    if (code >= 290 && code <= 299)
        return 'boolean';
    if (code >= 300 && code <= 369)
        return 'string';
    if (code >= 370 && code <= 389)
        return 'int16';
    if (code >= 390 && code <= 399)
        return 'string';
    if (code >= 400 && code <= 409)
        return 'int16';
    if (code >= 410 && code <= 419)
        return 'string';
    if (code >= 420 && code <= 429)
        return 'int32';
    if (code >= 430 && code <= 439)
        return 'string';
    if (code >= 440 && code <= 449)
        return 'int32';
    if (code >= 450 && code <= 459)
        return 'int32';
    if (code >= 460 && code <= 469)
        return 'double';
    if (code >= 470 && code <= 479)
        return 'string';
    if (code >= 480 && code <= 481)
        return 'string';
    if (code === 999)
        return 'string';
    if (code >= 1000 && code <= 1009)
        return 'string';
    if (code >= 1010 && code <= 1059)
        return 'double';
    if (code >= 1060 && code <= 1070)
        return 'int16';
    if (code === 1071)
        return 'int32';
    return 'string';
}
/**
 * Парсит строковое значение в типизированное значение DXF.
 * @param code - Код группы
 * @param raw - Сырое строковое значение
 * @returns Типизированное значение
 */
export function parseValue(code, raw) {
    const valueType = getValueType(code);
    switch (valueType) {
        case 'double':
            return parseFloat(raw);
        case 'int16':
        case 'int32':
        case 'int64':
            return parseInt(raw, 10);
        case 'boolean':
            return raw.trim() === '1';
        default:
            return raw.trim();
    }
}
/**
 * Разбивает текст ASCII DXF на пары код-значение.
 * @param text - Полный текст DXF файла
 * @returns Массив пар код-значение
 * @throws DXFError при ошибке парсинга
 */
export function parseGroups(text) {
    const lines = text.split(/\r?\n/);
    const groups = [];
    let i = 0;
    while (i < lines.length - 1) {
        const codeLine = lines[i].trim();
        if (codeLine === '') {
            i++;
            continue;
        }
        const code = parseInt(codeLine, 10);
        if (isNaN(code)) {
            throw new DXFError(ErrorCode.PARSE_ERROR, `Невалидный код группы на строке ${i + 1}: "${codeLine}"`, 'Проверьте, что файл является корректным ASCII DXF.');
        }
        const valueLine = lines[i + 1];
        if (valueLine === undefined) {
            throw new DXFError(ErrorCode.PARSE_ERROR, `Отсутствует значение для кода ${code} на строке ${i + 1}`, 'Файл DXF обрезан или повреждён.');
        }
        const value = parseValue(code, valueLine);
        groups.push({ code, value });
        i += 2;
    }
    return groups;
}
/**
 * Разбивает массив групп на секции DXF.
 * Секции начинаются с (0, SECTION) и заканчиваются (0, ENDSEC).
 * @param groups - Массив пар код-значение
 * @returns Массив секций
 * @throws DXFError при ошибке структуры
 */
export function parseSections(groups) {
    const sections = [];
    let i = 0;
    while (i < groups.length) {
        const group = groups[i];
        // Ищем начало секции: код 0, значение "SECTION"
        if (group.code === 0 && group.value === 'SECTION') {
            i++;
            // Следующая группа должна быть (2, <имя секции>)
            if (i >= groups.length) {
                throw new DXFError(ErrorCode.PARSE_ERROR, 'Неожиданный конец файла после SECTION', 'Файл DXF повреждён.');
            }
            const nameGroup = groups[i];
            if (nameGroup.code !== 2) {
                throw new DXFError(ErrorCode.PARSE_ERROR, `Ожидался код 2 (имя секции), получен ${nameGroup.code}`, 'Файл DXF имеет некорректную структуру секций.');
            }
            const sectionName = String(nameGroup.value);
            const sectionGroups = [];
            i++;
            // Собираем группы до ENDSEC
            while (i < groups.length) {
                const g = groups[i];
                if (g.code === 0 && g.value === 'ENDSEC') {
                    i++;
                    break;
                }
                sectionGroups.push(g);
                i++;
            }
            sections.push({ name: sectionName, groups: sectionGroups });
        }
        else if (group.code === 0 && group.value === 'EOF') {
            break;
        }
        else {
            i++;
        }
    }
    return sections;
}
/**
 * Полный парсинг ASCII DXF текста в массив секций.
 * @param text - Полный текст DXF файла
 * @returns Массив секций DXF
 */
export function parseAsciiDXF(text) {
    const groups = parseGroups(text);
    return parseSections(groups);
}
//# sourceMappingURL=ascii-reader.js.map