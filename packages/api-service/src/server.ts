import app from './index.js';

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
  console.log(`   Bot API: http://localhost:${PORT}/api/bot/message`);
  console.log(`   Telegram webhook: http://localhost:${PORT}/api/telegram/webhook`);
  console.log(`   Telegram webhook register: http://localhost:${PORT}/api/telegram/webhook/register`);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    console.log('   🤖 Telegram webhook mode enabled (set webhook in Telegram to /api/telegram/webhook)');
  } else {
    console.log('   ⚠️  TELEGRAM_BOT_TOKEN not set — Telegram webhook handling disabled');
  }
});
