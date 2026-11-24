import { Router } from 'express';
import { transaction, type Db } from '../db';

type StoreRow = { id: number; name: string; is_main: number };
const toStore = (r: StoreRow) => ({ id: r.id, name: r.name, isMain: r.is_main === 1 });

export function storesRouter(db: Db): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json((db.prepare('select * from stores order by is_main desc, name').all() as StoreRow[]).map(toStore));
  });
  r.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const isMain = req.body?.isMain ? 1 : 0;
    try {
      const create = transaction(db, () => {
        if (isMain) db.prepare('update stores set is_main = 0').run();
        return db.prepare('insert into stores(name, is_main) values (?, ?)').run(name, isMain).lastInsertRowid;
      });
      const id = Number(create());
      res.status(201).json(toStore(db.prepare('select * from stores where id = ?').get(id) as StoreRow));
    } catch {
      res.status(409).json({ error: 'store already exists' });
    }
  });
  return r;
}
