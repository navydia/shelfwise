import { Router } from 'express';
import type { Db } from '../db';

export type ItemRow = {
  id: number; name: string; store_id: number; state: string; usual_qty: number;
  photo: string | null; last_price_cents: number | null; on_list: number;
};
export const toItem = (r: ItemRow) => ({
  id: r.id, name: r.name, storeId: r.store_id, state: r.state, usualQty: r.usual_qty,
  photo: r.photo, lastPriceCents: r.last_price_cents, onList: r.on_list === 1,
});

const STATES = ['stocked', 'low', 'out'];
const isIntOrNull = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0);

export function itemsRouter(db: Db): Router {
  const r = Router();
  const get = (id: number) => db.prepare('select * from items where id = ?').get(id) as ItemRow | undefined;

  r.get('/', (req, res) => {
    const storeId = Number(req.query.storeId);
    const rows = Number.isInteger(storeId)
      ? db.prepare('select * from items where store_id = ? order by name collate nocase').all(storeId)
      : db.prepare('select * from items order by name collate nocase').all();
    res.json((rows as ItemRow[]).map(toItem));
  });

  r.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const storeId = Number(req.body?.storeId);
    const usualQty = req.body?.usualQty === undefined ? 1 : Number(req.body.usualQty);
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!Number.isInteger(usualQty) || usualQty < 1) return res.status(400).json({ error: 'usualQty must be >= 1' });
    if (!db.prepare('select 1 from stores where id = ?').get(storeId)) return res.status(400).json({ error: 'unknown store' });
    try {
      const id = Number(db.prepare('insert into items(name, store_id, usual_qty) values (?, ?, ?)').run(name, storeId, usualQty).lastInsertRowid);
      res.status(201).json(toItem(get(id)!));
    } catch {
      res.status(409).json({ error: 'item already exists in this store' });
    }
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const cur = get(id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const b = req.body ?? {};
    if (b.state !== undefined && !STATES.includes(b.state)) return res.status(400).json({ error: 'invalid state' });
    if (b.usualQty !== undefined && !(Number.isInteger(b.usualQty) && b.usualQty >= 1)) return res.status(400).json({ error: 'invalid usualQty' });
    if (b.lastPriceCents !== undefined && !isIntOrNull(b.lastPriceCents)) return res.status(400).json({ error: 'invalid lastPriceCents' });
    if (b.name !== undefined && !String(b.name).trim()) return res.status(400).json({ error: 'name required' });
    if (b.storeId !== undefined && !db.prepare('select 1 from stores where id = ?').get(b.storeId)) return res.status(400).json({ error: 'unknown store' });
    try {
      db.prepare(`update items set name = ?, store_id = ?, state = ?, usual_qty = ?, last_price_cents = ?, on_list = ? where id = ?`).run(
        b.name !== undefined ? String(b.name).trim() : cur.name,
        b.storeId ?? cur.store_id,
        b.state ?? cur.state,
        b.usualQty ?? cur.usual_qty,
        b.lastPriceCents !== undefined ? b.lastPriceCents : cur.last_price_cents,
        b.onList !== undefined ? (b.onList ? 1 : 0) : cur.on_list,
        id,
      );
    } catch {
      return res.status(409).json({ error: 'item already exists in this store' });
    }
    res.json(toItem(get(id)!));
  });

  r.delete('/:id', (req, res) => {
    db.prepare('delete from items where id = ?').run(Number(req.params.id));
    res.status(204).end();
  });
  return r;
}
