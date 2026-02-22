type ExpressLikeHandler = (req: any, res: any) => void;

let cachedApp: ExpressLikeHandler | null = null;

async function loadApp(): Promise<ExpressLikeHandler> {
  if (cachedApp) return cachedApp;

  try {
    const mod = await import('../packages/api-service/dist/index.js');
    cachedApp = mod.default as ExpressLikeHandler;
    return cachedApp;
  } catch {
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
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const app = await loadApp();
    app(req, res);
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown bootstrap error';
    res.status(500).json({ error: 'API bootstrap failed', details });
  }
}
