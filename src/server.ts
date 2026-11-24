import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { storesRouter } from './routes/stores';
import { itemsRouter } from './routes/items';
import { listRouter } from './routes/list';
import { receiptsRouter } from './routes/receipts';

export type AppOptions = {
  dataDir?: string;
  readReceiptText?: (imagePath: string) => Promise<string>;
};

export function createApp(db: Db, opts: AppOptions = {}): Express {
  const dataDir = opts.dataDir ?? process.env.SHELFWISE_DATA ?? path.resolve('data');
  fs.mkdirSync(path.join(dataDir, 'photos'), { recursive: true });
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/stores', storesRouter(db));
  app.use('/api/stores', listRouter(db));
  app.use('/api/items', itemsRouter(db, dataDir));
  app.use('/api/receipts', receiptsRouter(db, dataDir, opts.readReceiptText));
  app.use(express.static(path.resolve('public')));
  app.use('/photos', express.static(path.join(dataDir, 'photos'), { maxAge: '30d', immutable: true }));
  return app;
}
