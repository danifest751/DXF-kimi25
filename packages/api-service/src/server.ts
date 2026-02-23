import app from './index.js';
import { startTelegramBotPolling } from '../../bot-service/src/index.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 DXF Viewer API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Parse:  http://localhost:${PORT}/api/parse`);
  console.log(`   Normalize: http://localhost:${PORT}/api/normalize`);
  console.log(`   Cutting: http://localhost:${PORT}/api/cutting-stats`);
  console.log(`   Nesting: http://localhost:${PORT}/api/nest`);
  console.log(`   DXF export: http://localhost:${PORT}/api/export/dxf`);
  console.log(`   CSV export: http://localhost:${PORT}/api/export/csv`);
  console.log(`   Price: http://localhost:${PORT}/api/price`);
  console.log(`   Bot: http://localhost:${PORT}/api/bot/message`);

  // Start Telegram bot polling in the same process (shares sharedSheetStore)
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    console.log(`   🤖 Telegram bot polling started`);
    void startTelegramBotPolling(botToken).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[BotService] polling fatal:', msg);
    });
  } else {
    console.log(`   ⚠️  TELEGRAM_BOT_TOKEN not set — bot polling disabled`);
  }
});
