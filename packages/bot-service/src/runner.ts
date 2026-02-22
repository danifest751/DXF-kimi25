import { startTelegramBotPolling } from './index.js';

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required. Set it in environment before starting bot-service.');
  }

  console.log('[BotService] Telegram polling started');
  await startTelegramBotPolling(token);
}

void main().catch((error) => {
  const details = error instanceof Error ? error.message : String(error);
  console.error('[BotService] fatal error:', details);
  process.exit(1);
});
