/**
 * @module bot-service
 * Telegram bot service stub.
 *
 * TODO: Реализовать Telegram бота для:
 * - Приём DXF файлов
 * - Анализ и расчёт стоимости
 * - Отправка отчётов пользователю
 * - Интеграция с pricing модулем
 */
export interface BotMessage {
    readonly chatId: string;
    readonly text: string;
    readonly attachments?: readonly Buffer[];
}
export interface BotResponse {
    readonly success: boolean;
    readonly message: string;
    readonly data?: unknown;
}
/**
 * Обрабатывает сообщение от бота (заглушка).
 * Всегда возвращает "TBD" пока бот не реализован.
 */
export declare function processBotMessage(message: BotMessage): Promise<BotResponse>;
/**
 * Отправляет сообщение через бота (заглушка).
 */
export declare function sendBotMessage(chatId: string, text: string): Promise<BotResponse>;
/**
 * Проверяет, является ли сообщение командой бота.
 */
export declare function isBotCommand(text: string): boolean;
/**
 * Извлекает команду из текста сообщения.
 */
export declare function extractCommand(text: string): {
    command: string;
    args: string;
} | null;
//# sourceMappingURL=index.d.ts.map