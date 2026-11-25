import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { STORE_COLORS, transaction, type Db } from '../db';
import { compareAisles } from '../lib/aisles';

type StoreRow = { id: number; name: string; is_main: number; color: string };
const toStore = (r: StoreRow) => ({ id: r.id, name: r.name, isMain: r.is_main === 1, color: r.color });
const validColor = (c: unknown): c is (typeof STORE_COLORS)[number] => (STORE_COLORS as readonly string[]).includes(c as string);

export function storesRouter(db: Db, dataDir: string): Router {
  const r = Router();
  const find = (id: number) => db.prepare('select * from stores where id = ?').get(id) as StoreRow | undefined;

  r.get('/', (_req, res) => {
    res.json((db.prepare('select * from stores order by is_main desc, name').all() as StoreRow[]).map(toStore));
  });
  r.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const color = req.body?.color ?? 'tomato';
    if (!validColor(color)) return res.status(400).json({ error: 'unknown colour' });
    const isMain = req.body?.isMain ? 1 : 0;
    try {
      const create = transaction(db, () => {
        if (isMain) db.prepare('update stores set is_main = 0').run();
        return db.prepare('insert into stores(name, is_main, color) values (?, ?, ?)').run(name, isMain, color).lastInsertRowid;
      });
      const id = Number(create());
      res.status(201).json(toStore(find(id)!));
    } catch {
      res.status(409).json({ error: 'store already exists' });
    }
  });
  r.patch('/:id', (req, res) => {
    const store = find(Number(req.params.id));
    if (!store) return res.status(404).json({ error: 'store not found' });
    const body = req.body ?? {};
    let name = store.name;
    if (body.name !== undefined) {
      name = String(body.name).trim();
      if (!name) return res.status(400).json({ error: 'name required' });
    }
    let color = store.color;
    if (body.color !== undefined) {
      if (!validColor(body.color)) return res.status(400).json({ error: 'unknown colour' });
      color = body.color;
    }
    if (body.isMain === false) return res.status(400).json({ error: 'make another store main instead' });
    try {
      transaction(db, () => {
        if (body.isMain === true) db.prepare('update stores set is_main = 0').run();
        db.prepare('update stores set name = ?, color = ?, is_main = ? where id = ?')
          .run(name, color, body.isMain === true ? 1 : store.is_main, store.id);
      })();
    } catch {
      return res.status(409).json({ error: 'store already exists' });
    }
    res.json(toStore(find(store.id)!));
  });
  r.get('/:id/aisles', (req, res) => {
    const store = find(Number(req.params.id));
    if (!store) return res.status(404).json({ error: 'store not found' });
    const rows = db.prepare(
      "select aisle, count(*) as count from items where store_id = ? and archived_at is null and aisle is not null and aisle != '' group by aisle",
    ).all(store.id) as { aisle: string; count: number }[];
    res.json(rows.sort((a, b) => compareAisles(a.aisle, b.aisle)));
  });
  r.post('/:id/aisles/rename', (req, res) => {
    const store = find(Number(req.params.id));
    if (!store) return res.status(404).json({ error: 'store not found' });
    const from = String(req.body?.from ?? '');
    const to = String(req.body?.to ?? '').trim();
    if (!to) return res.status(400).json({ error: 'name required' });
    if (to.length > 20) return res.status(400).json({ error: 'aisle is too long' });
    const info = db.prepare('update items set aisle = ?, changed_at = ? where store_id = ? and aisle = ?')
      .run(to, new Date().toISOString(), store.id, from);
    res.json({ renamed: Number(info.changes) });
  });
  r.delete('/:id', (req, res) => {
    const store = find(Number(req.params.id));
    if (!store) return res.status(404).json({ error: 'store not found' });
    if (store.is_main === 1) return res.status(409).json({ error: 'make another store main first' });
    const { n } = db.prepare('select count(*) as n from items where store_id = ?').get(store.id) as { n: number };
    if (n > 0) return res.status(409).json({ error: `Move or delete its ${n} staples first`, staples: n });
    const photos = (db.prepare('select photo from receipts where store_id = ? and photo is not null').all(store.id) as { photo: string }[])
      .map((p) => p.photo);
    transaction(db, () => {
      db.prepare('delete from receipts where store_id = ?').run(store.id);
      db.prepare('delete from stores where id = ?').run(store.id);
    })();
    for (const p of photos) fs.rmSync(path.join(dataDir, 'photos', path.basename(p)), { force: true });
    res.status(204).end();
  });
  return r;
}
