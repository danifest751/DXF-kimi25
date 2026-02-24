import { handleTelegramWebhookUpdate, type TelegramUpdate } from '../packages/bot-service/src/index.ts';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
    if (expectedSecret.length > 0) {
      const receivedSecret = String(req.headers?.['x-telegram-bot-api-secret-token'] ?? '').trim();
      if (receivedSecret !== expectedSecret) {
        res.status(401).json({ error: 'Invalid webhook secret' });
        return;
      }
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });
      return;
    }

    await handleTelegramWebhookUpdate(req.body as TelegramUpdate, botToken);
    res.status(200).json({ ok: true });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Telegram webhook failed', details });
  }
}
