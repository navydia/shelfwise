import { Router } from 'express';
import type { Db } from '../db';

type CategoryRow = { id: number; name: string; count: number };

export function categoriesRouter(db: Db): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    const rows = db.prepare(
      `select c.id, c.name, (select count(*) from items i where i.category_id = c.id and i.archived_at is null) as count
       from categories c order by c.name collate nocase`,
    ).all() as CategoryRow[];
    res.json(rows.map((c) => ({ id: c.id, name: c.name, count: c.count })));
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
  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('select 1 from categories where id = ?').get(id)) return res.status(404).json({ error: 'category not found' });
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      db.prepare('update categories set name = ? where id = ?').run(name, id);
    } catch {
      return res.status(409).json({ error: 'category already exists' });
    }
    res.json({ id, name });
  });
  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('select 1 from categories where id = ?').get(id)) return res.status(404).json({ error: 'category not found' });
    // Archived staples keep their category, so they count as "in use" too.
    const { n } = db.prepare('select count(*) as n from items where category_id = ?').get(id) as { n: number };
    if (n > 0) return res.status(409).json({ error: `Move its ${n} staples first`, staples: n });
    db.prepare('delete from categories where id = ?').run(id);
    res.status(204).end();
  });
  return r;
}
