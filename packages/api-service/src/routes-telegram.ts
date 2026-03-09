import { Router, type Request, type Response } from 'express';
import {
  handleTelegramWebhookUpdate,
  processBotMessage,
  setTelegramWebhook,
  type TelegramUpdate,
} from '../../bot-service/src/index.js';

const router = Router();

function internalSecretGuard(req: Request, res: Response, next: () => void): void {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim() ?? '';
  if (internalSecret.length > 0) {
    const provided = req.header('x-internal-secret')?.trim() ?? '';
    if (provided !== internalSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }
  next();
}

router.post('/bot/message', internalSecretGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId, text, attachments } = req.body;
    const result = await processBotMessage({ chatId, text, attachments });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Bot processing failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post(['/telegram/webhook', '/telegram-webhook'], async (req: Request, res: Response): Promise<void> => {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
    if (expectedSecret.length > 0) {
      const receivedSecret = req.header('x-telegram-bot-api-secret-token')?.trim() ?? '';
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
    res.status(500).json({ error: 'Telegram webhook failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post(['/telegram/webhook/register', '/telegram-webhook-register'], internalSecretGuard, async (req: Request, res: Response): Promise<void> => {
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
    res.json({ success: true, webhookUrl, secretEnabled: secret.length > 0 });
  } catch (error) {
    res.status(500).json({ error: 'Telegram webhook registration failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export { setTelegramWebhook };
export default router;
