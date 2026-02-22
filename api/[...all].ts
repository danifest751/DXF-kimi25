import app from '../packages/api-service/src/index.js';

export default function handler(req: any, res: any): void {
  app(req, res);
}
