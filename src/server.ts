import express, { type Express } from 'express';
import type { Db } from './db';

export function createApp(db: Db): Express {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  void db;
  return app;
}
