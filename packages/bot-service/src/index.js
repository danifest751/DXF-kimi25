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
/**
 * Обрабатывает сообщение от бота (заглушка).
 * Всегда возвращает "TBD" пока бот не реализован.
 */
export async function processBotMessage(message) {
    console.log('[BotService] Received message:', message.text);
    return {
        success: false,
        message: 'TBD: Bot integration not implemented. Use API endpoint instead.',
    };
}
/**
 * Отправляет сообщение через бота (заглушка).
 */
export async function sendBotMessage(chatId, text) {
    console.log('[BotService] Would send message to', chatId, ':', text);
    return {
        success: false,
        message: 'TBD: Bot integration not implemented.',
    };
}
/**
 * Проверяет, является ли сообщение командой бота.
 */
export function isBotCommand(text) {
    return text.startsWith('/');
}
/**
 * Извлекает команду из текста сообщения.
 */
export function extractCommand(text) {
    const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (!match)
        return null;
    return {
        command: match[1],
        args: match[2] || '',
    };
}
//# sourceMappingURL=index.js.map