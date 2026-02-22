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
export async function processBotMessage(message: BotMessage): Promise<BotResponse> {
  console.log('[BotService] Received message:', message.text);
  
  return {
    success: false,
    message: 'TBD: Bot integration not implemented. Use API endpoint instead.',
  };
}

/**
 * Отправляет сообщение через бота (заглушка).
 */
export async function sendBotMessage(chatId: string, text: string): Promise<BotResponse> {
  console.log('[BotService] Would send message to', chatId, ':', text);
  
  return {
    success: false,
    message: 'TBD: Bot integration not implemented.',
  };
}

/**
 * Проверяет, является ли сообщение командой бота.
 */
export function isBotCommand(text: string): boolean {
  return text.startsWith('/');
}

/**
 * Извлекает команду из текста сообщения.
 */
export function extractCommand(text: string): { command: string; args: string } | null {
  const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (!match) return null;
  
  return {
    command: match[1]!,
    args: match[2] || '',
  };
}
