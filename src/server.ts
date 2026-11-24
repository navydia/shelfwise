import express, { type Express } from 'express';
import type { Db } from './db';
import { storesRouter } from './routes/stores';
import { itemsRouter } from './routes/items';

export type AppOptions = {
  dataDir?: string;
  readReceiptText?: (imagePath: string) => Promise<string>;
};

export function createApp(db: Db, _opts: AppOptions = {}): Express {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/stores', storesRouter(db));
  app.use('/api/items', itemsRouter(db));
  return app;
}
