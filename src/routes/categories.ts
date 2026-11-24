import { Router } from 'express';
import type { Db } from '../db';

type CategoryRow = { id: number; name: string };

export function categoriesRouter(db: Db): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json((db.prepare('select id, name from categories order by name collate nocase').all() as CategoryRow[]).map((c) => ({ id: c.id, name: c.name })));
  });
  r.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const id = Number(db.prepare('insert into categories(name) values (?)').run(name).lastInsertRowid);
      res.status(201).json({ id, name });
    } catch {
      res.status(409).json({ error: 'category already exists' });
    }
  });
  return r;
}
