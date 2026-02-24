type ExpressLikeHandler = (req: any, res: any) => void;

let cachedApp: ExpressLikeHandler | null = null;

async function loadApp(): Promise<ExpressLikeHandler> {
  if (cachedApp) return cachedApp;

  try {
    const mod = await import('../packages/api-service/src/index.ts');
    cachedApp = mod.default as ExpressLikeHandler;
    return cachedApp;
  } catch {
    const mod = await import('../packages/api-service/src/index.js');
    cachedApp = mod.default as ExpressLikeHandler;
    return cachedApp;
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const app = await loadApp();
    req.url = '/api/nesting/share';
    req.originalUrl = '/api/nesting/share';
    app(req, res);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Nesting share bootstrap failed', details });
  }
}
