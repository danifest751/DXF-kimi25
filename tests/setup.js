"use strict";
/**
 * Setup файл для Vitest
 * Глобальная настройка для всех тестов
 */
// Глобальные моки для API браузера
if (typeof globalThis.structuredClone === 'undefined') {
    globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}
// Mock для WebGL контекста (если потребуется)
HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
    apply(target, thisArg, args) {
        const contextType = args[0];
        if (contextType === 'webgl' || contextType === 'webgl2') {
            return null;
        }
        return Reflect.apply(target, thisArg, args);
    },
});
//# sourceMappingURL=setup.js.map