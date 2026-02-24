import { setTelegramWebhook } from '../../../../packages/bot-service/src/index.ts';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });
      return;
    }

    const explicitUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const webhookUrl = explicitUrl || process.env.TELEGRAM_WEBHOOK_URL?.trim() || '';
    if (!webhookUrl) {
      res.status(400).json({ error: 'Provide webhook URL via body.url or TELEGRAM_WEBHOOK_URL' });
      return;
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
    await setTelegramWebhook(botToken, webhookUrl, secret);
    res.status(200).json({ success: true, webhookUrl, secretEnabled: secret.length > 0 });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Telegram webhook registration failed', details });
  }
}
