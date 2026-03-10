import { Router, type Request, type Response } from 'express';
import { getAuthSessionByToken, getTelegramUserIdByUserId } from './telegram-auth.js';
import { getAuthTokenFromRequest } from './middleware/auth.js';

const router = Router();

router.post('/notify', async (req: Request, res: Response): Promise<void> => {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const session = await getAuthSessionByToken(token).catch(() => null);
  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  if (!botToken) {
    res.json({ ok: true, skipped: 'no bot token configured' });
    return;
  }

  const { event, sheetsCount, partsCount, avgUtilization, filename } = req.body as {
    event?: string;
    sheetsCount?: number;
    partsCount?: number;
    avgUtilization?: number;
    filename?: string;
  };

  const chatId = await getTelegramUserIdByUserId(session.userId).catch(() => null);
  if (!chatId) {
    res.json({ ok: true, skipped: 'no telegram chat id' });
    return;
  }

  let text = '';
  if (event === 'nesting_done') {
    text = `✅ Раскладка завершена\n📄 Листов: ${sheetsCount ?? 0}\n🔩 Деталей: ${partsCount ?? 0}\n📊 Заполнение: ${avgUtilization ?? 0}%`;
  } else if (event === 'file_uploaded') {
    text = `📁 Файл загружен: ${filename ?? '—'}`;
  } else {
    res.json({ ok: true, skipped: 'unknown event' });
    return;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const data = await resp.json() as { ok: boolean };
    if (!data.ok) {
      res.status(502).json({ error: 'Telegram API error', detail: data });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'Failed to send notification', detail: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
