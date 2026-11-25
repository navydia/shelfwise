import { Router } from 'express';
import type { Db } from '../db';
import { isIntOrNull, isPositive } from './items';

export type OneoffRow = { id: number; store_id: number; name: string; price_cents: number | null; amount: number; created_at: string };
export const toOneoff = (o: OneoffRow) => ({ id: o.id, storeId: o.store_id, name: o.name, priceCents: o.price_cents, amount: o.amount, createdAt: o.created_at });

export function oneoffsRouter(db: Db): Router {
  const r = Router();
  const find = (id: number) => db.prepare('select * from oneoffs where id = ?').get(id) as OneoffRow | undefined;
  const storeExists = (id: number) => !!db.prepare('select 1 from stores where id = ?').get(id);

  r.get('/stores/:id/oneoffs', (req, res) => {
    const storeId = Number(req.params.id);
    if (!storeExists(storeId)) return res.status(404).json({ error: 'store not found' });
    const rows = db.prepare('select * from oneoffs where store_id = ? order by id').all(storeId) as OneoffRow[];
    res.json(rows.map(toOneoff));
  });

  r.post('/stores/:id/oneoffs', (req, res) => {
    const storeId = Number(req.params.id);
    if (!storeExists(storeId)) return res.status(404).json({ error: 'store not found' });
    const b = req.body ?? {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'name is required' });
    const price = b.priceCents === undefined ? null : b.priceCents;
    if (!isIntOrNull(price)) return res.status(400).json({ error: 'invalid priceCents' });
    const amount = b.amount === undefined ? 1 : b.amount;
    if (!isPositive(amount)) return res.status(400).json({ error: 'invalid amount' });
    const id = Number(db.prepare('insert into oneoffs(store_id, name, price_cents, amount, created_at) values (?, ?, ?, ?, ?)')
      .run(storeId, name, price, amount, new Date().toISOString()).lastInsertRowid);
    res.status(201).json(toOneoff(find(id)!));
  });

  r.patch('/oneoffs/:id', (req, res) => {
    const cur = find(Number(req.params.id));
    if (!cur) return res.status(404).json({ error: 'not found' });
    const b = req.body ?? {};
    let name = cur.name;
    if (b.name !== undefined) {
      name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'name is required' });
    }
    if (b.priceCents !== undefined && !isIntOrNull(b.priceCents)) return res.status(400).json({ error: 'invalid priceCents' });
    if (b.amount !== undefined && !isPositive(b.amount)) return res.status(400).json({ error: 'invalid amount' });
    db.prepare('update oneoffs set name = ?, price_cents = ?, amount = ? where id = ?')
      .run(name, b.priceCents === undefined ? cur.price_cents : b.priceCents, b.amount ?? cur.amount, cur.id);
    res.json(toOneoff(find(cur.id)!));
  });

  r.delete('/oneoffs/:id', (req, res) => {
    const info = db.prepare('delete from oneoffs where id = ?').run(Number(req.params.id));
    if (!info.changes) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });
  return r;
}
