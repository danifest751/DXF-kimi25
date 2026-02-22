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
  console.log(`   Bot: http://localhost:${PORT}/api/bot/message`);
});
