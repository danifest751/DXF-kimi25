/**
 * @module core/dxf/reader/binary-reader
 * Парсер Binary DXF файлов.
 * Binary DXF начинается с сигнатуры "AutoCAD Binary DXF\r\n\x1a\0".
 */
import { DXFError, ErrorCode, } from '../../types/index.js';
import { getValueType, parseSections } from './ascii-reader.js';
/** Сигнатура Binary DXF файла */
export const BINARY_DXF_SIGNATURE = 'AutoCAD Binary DXF\r\n\x1a\0';
/** Длина сигнатуры в байтах */
export const BINARY_SIGNATURE_LENGTH = 22;
/**
 * Проверяет, является ли буфер Binary DXF файлом.
 * @param buffer - ArrayBuffer с содержимым файла
 * @returns true если файл начинается с Binary DXF сигнатуры
 */
export function isBinaryDXF(buffer) {
    if (buffer.byteLength < BINARY_SIGNATURE_LENGTH) {
        return false;
    }
    const header = new Uint8Array(buffer, 0, BINARY_SIGNATURE_LENGTH);
    const decoder = new TextDecoder('ascii');
    const headerStr = decoder.decode(header);
    return headerStr === BINARY_DXF_SIGNATURE;
}
/**
 * Читает строку из DataView до нулевого байта.
 * @param view - DataView
 * @param offset - Смещение в байтах
 * @returns Кортеж [строка, новое смещение]
 */
function readNullTerminatedString(view, offset) {
    const bytes = [];
    let pos = offset;
    while (pos < view.byteLength) {
        const byte = view.getUint8(pos);
        pos++;
        if (byte === 0)
            break;
        bytes.push(byte);
    }
    const decoder = new TextDecoder('utf-8');
    return [decoder.decode(new Uint8Array(bytes)), pos];
}
/**
 * Читает значение группы из бинарного потока.
 * @param view - DataView
 * @param offset - Текущее смещение
 * @param code - Код группы
 * @returns Кортеж [значение, новое смещение]
 */
function readBinaryValue(view, offset, code) {
    const valueType = getValueType(code);
    let pos = offset;
    switch (valueType) {
        case 'string': {
            const [str, newPos] = readNullTerminatedString(view, pos);
            return [str, newPos];
        }
        case 'double': {
            const val = view.getFloat64(pos, true); // little-endian
            return [val, pos + 8];
        }
        case 'int16': {
            const val = view.getInt16(pos, true);
            return [val, pos + 2];
        }
        case 'int32': {
            const val = view.getInt32(pos, true);
            return [val, pos + 4];
        }
        case 'int64': {
            // JavaScript не поддерживает int64 нативно, читаем как два int32
            const low = view.getInt32(pos, true);
            const high = view.getInt32(pos + 4, true);
            // Для практических целей DXF int64 обычно помещается в Number
            const val = high * 0x100000000 + (low >>> 0);
            return [val, pos + 8];
        }
        case 'boolean': {
            const val = view.getUint8(pos) !== 0;
            return [val, pos + 1];
        }
        default: {
            const [str, newPos] = readNullTerminatedString(view, pos);
            return [str, newPos];
        }
    }
}
/**
 * Парсит Binary DXF буфер в массив пар код-значение.
 * @param buffer - ArrayBuffer с содержимым Binary DXF файла
 * @returns Массив пар код-значение
 * @throws DXFError при ошибке парсинга
 */
export function parseBinaryGroups(buffer) {
    if (!isBinaryDXF(buffer)) {
        throw new DXFError(ErrorCode.INVALID_FILE_FORMAT, 'Файл не является Binary DXF', 'Проверьте сигнатуру файла. Ожидается "AutoCAD Binary DXF".');
    }
    const view = new DataView(buffer);
    const groups = [];
    let offset = BINARY_SIGNATURE_LENGTH;
    while (offset < view.byteLength - 1) {
        // Читаем код группы (2 байта, int16, little-endian)
        const code = view.getInt16(offset, true);
        offset += 2;
        // Читаем значение
        const [value, newOffset] = readBinaryValue(view, offset, code);
        offset = newOffset;
        groups.push({ code, value });
        // Проверяем EOF
        if (code === 0 && value === 'EOF') {
            break;
        }
    }
    return groups;
}
/**
 * Полный парсинг Binary DXF буфера в массив секций.
 * @param buffer - ArrayBuffer с содержимым Binary DXF файла
 * @returns Массив секций DXF
 */
export function parseBinaryDXF(buffer) {
    const groups = parseBinaryGroups(buffer);
    return parseSections(groups);
}
//# sourceMappingURL=binary-reader.js.map