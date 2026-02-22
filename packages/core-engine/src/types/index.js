/**
 * @module core/types
 * Базовые типы для DXF Viewer.
 * Все публичные интерфейсы и перечисления проекта.
 */
// ─── Форматы и версии DXF ───────────────────────────────────────────
/** Формат DXF файла */
export var DXFFormat;
(function (DXFFormat) {
    DXFFormat["ASCII"] = "ASCII";
    DXFFormat["BINARY"] = "BINARY";
})(DXFFormat || (DXFFormat = {}));
/** Версия DXF */
export var DXFVersion;
(function (DXFVersion) {
    DXFVersion["R12"] = "R12";
    DXFVersion["R2000"] = "2000";
    DXFVersion["R2004"] = "2004";
    DXFVersion["R2007"] = "2007";
    DXFVersion["R2010"] = "2010";
    DXFVersion["R2013"] = "2013";
    DXFVersion["R2018"] = "2018";
    DXFVersion["R2021"] = "2021";
})(DXFVersion || (DXFVersion = {}));
// ─── Типы сущностей ─────────────────────────────────────────────────
/** Перечисление всех поддерживаемых типов DXF-сущностей */
export var DXFEntityType;
(function (DXFEntityType) {
    DXFEntityType["LINE"] = "LINE";
    DXFEntityType["XLINE"] = "XLINE";
    DXFEntityType["RAY"] = "RAY";
    DXFEntityType["CIRCLE"] = "CIRCLE";
    DXFEntityType["ARC"] = "ARC";
    DXFEntityType["ELLIPSE"] = "ELLIPSE";
    DXFEntityType["SPLINE"] = "SPLINE";
    DXFEntityType["POLYLINE"] = "POLYLINE";
    DXFEntityType["LWPOLYLINE"] = "LWPOLYLINE";
    DXFEntityType["POINT"] = "POINT";
    DXFEntityType["SOLID"] = "SOLID";
    DXFEntityType["TRACE"] = "TRACE";
    DXFEntityType["HATCH"] = "HATCH";
    DXFEntityType["TEXT"] = "TEXT";
    DXFEntityType["MTEXT"] = "MTEXT";
    DXFEntityType["DIMENSION"] = "DIMENSION";
    DXFEntityType["LEADER"] = "LEADER";
    DXFEntityType["MLEADER"] = "MLEADER";
    DXFEntityType["INSERT"] = "INSERT";
    DXFEntityType["ATTDEF"] = "ATTDEF";
    DXFEntityType["ATTRIB"] = "ATTRIB";
    DXFEntityType["THREE_D_FACE"] = "3DFACE";
    DXFEntityType["POLYFACE"] = "POLYFACE";
    DXFEntityType["MESH"] = "MESH";
    DXFEntityType["SURFACE"] = "SURFACE";
    DXFEntityType["BODY"] = "BODY";
    DXFEntityType["IMAGE"] = "IMAGE";
    DXFEntityType["UNDERLAY"] = "UNDERLAY";
    DXFEntityType["TOLERANCE"] = "TOLERANCE";
    DXFEntityType["TABLE"] = "TABLE";
    DXFEntityType["VIEWPORT"] = "VIEWPORT";
})(DXFEntityType || (DXFEntityType = {}));
// ─── Ошибки ─────────────────────────────────────────────────────────
/** Коды ошибок */
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["INVALID_FILE_FORMAT"] = "INVALID_FILE_FORMAT";
    ErrorCode["UNSUPPORTED_VERSION"] = "UNSUPPORTED_VERSION";
    ErrorCode["PARSE_ERROR"] = "PARSE_ERROR";
    ErrorCode["ENTITY_ERROR"] = "ENTITY_ERROR";
    ErrorCode["RENDER_ERROR"] = "RENDER_ERROR";
    ErrorCode["MEMORY_ERROR"] = "MEMORY_ERROR";
    ErrorCode["WORKER_ERROR"] = "WORKER_ERROR";
})(ErrorCode || (ErrorCode = {}));
/** Типизированная ошибка DXF */
export class DXFError extends Error {
    code;
    suggestion;
    constructor(code, message, suggestion) {
        super(message);
        this.name = 'DXFError';
        this.code = code;
        this.suggestion = suggestion;
    }
}
// ─── Worker сообщения ───────────────────────────────────────────────
/** Типы сообщений Worker */
export var WorkerMessageType;
(function (WorkerMessageType) {
    WorkerMessageType["PARSE_START"] = "PARSE_START";
    WorkerMessageType["PARSE_PROGRESS"] = "PARSE_PROGRESS";
    WorkerMessageType["PARSE_COMPLETE"] = "PARSE_COMPLETE";
    WorkerMessageType["PARSE_ERROR"] = "PARSE_ERROR";
    WorkerMessageType["RENDER_START"] = "RENDER_START";
    WorkerMessageType["RENDER_PROGRESS"] = "RENDER_PROGRESS";
    WorkerMessageType["RENDER_COMPLETE"] = "RENDER_COMPLETE";
    WorkerMessageType["RENDER_ERROR"] = "RENDER_ERROR";
})(WorkerMessageType || (WorkerMessageType = {}));
//# sourceMappingURL=index.js.map