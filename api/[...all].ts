import app from '../packages/api-service/src/index.js';

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: any, res: any): void {
  app(req, res);
}
