import { Router } from 'express';
import multer from 'multer';
import type { Db } from '../db';
import { saveItemPhoto } from '../lib/photos';

export type ItemRow = {
  id: number; name: string; store_id: number; usual_qty: number;
  photo: string | null; last_price_cents: number | null; on_list: number;
  price_source: 'receipt' | 'manual' | null; price_updated_at: string | null;
  category_id: number | null; aisle: string | null; changed_at: string;
};
export const toItem = (r: ItemRow) => ({
  id: r.id, name: r.name, storeId: r.store_id, onList: r.on_list === 1, usualQty: r.usual_qty,
  photo: r.photo, lastPriceCents: r.last_price_cents, priceSource: r.price_source, priceDate: r.price_updated_at,
  categoryId: r.category_id, aisle: r.aisle, changedAt: r.changed_at,
});

const AISLE_MAX = 20;
const isIntOrNull = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0);

export function itemsRouter(db: Db, dataDir: string): Router {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
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
    const b = req.body ?? {};
    const categoryId = b.categoryId ?? null;
    if (categoryId !== null && !db.prepare('select 1 from categories where id = ?').get(categoryId)) return res.status(400).json({ error: 'unknown category' });
    const aisle = b.aisle === undefined || b.aisle === null ? null : String(b.aisle).trim() || null;
    if (aisle && aisle.length > AISLE_MAX) return res.status(400).json({ error: 'aisle is too long' });
    const price = b.lastPriceCents ?? null;
    if (!isIntOrNull(price)) return res.status(400).json({ error: 'invalid lastPriceCents' });
    const now = new Date().toISOString();
    try {
      const id = Number(db.prepare(`insert into items(name, store_id, usual_qty, category_id, aisle, on_list, last_price_cents, price_source, price_updated_at, changed_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, storeId, usualQty, categoryId, aisle, b.onList ? 1 : 0, price,
        price === null ? null : 'manual', price === null ? null : now, now,
      ).lastInsertRowid);
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
    if (b.usualQty !== undefined && !(Number.isInteger(b.usualQty) && b.usualQty >= 1)) return res.status(400).json({ error: 'invalid usualQty' });
    if (b.lastPriceCents !== undefined && !isIntOrNull(b.lastPriceCents)) return res.status(400).json({ error: 'invalid lastPriceCents' });
    if (b.name !== undefined && !String(b.name).trim()) return res.status(400).json({ error: 'name required' });
    if (b.storeId !== undefined && !db.prepare('select 1 from stores where id = ?').get(b.storeId)) return res.status(400).json({ error: 'unknown store' });
    if (b.categoryId !== undefined && b.categoryId !== null && !db.prepare('select 1 from categories where id = ?').get(b.categoryId)) return res.status(400).json({ error: 'unknown category' });
    let aisle = cur.aisle;
    if (b.aisle !== undefined) {
      aisle = b.aisle === null ? null : String(b.aisle).trim() || null;
      if (aisle && aisle.length > AISLE_MAX) return res.status(400).json({ error: 'aisle is too long' });
    } else if (b.storeId !== undefined && b.storeId !== cur.store_id) {
      aisle = null;
    }
    const now = new Date().toISOString();
    let { last_price_cents: price, price_source: source, price_updated_at: priceAt } = cur;
    let clearReceipt = false;
    if (b.lastPriceCents !== undefined) {
      price = b.lastPriceCents;
      source = price === null ? null : 'manual';
      priceAt = price === null ? null : now;
      clearReceipt = true;
    }
    try {
      db.prepare(`update items set name = ?, store_id = ?, usual_qty = ?, last_price_cents = ?, price_source = ?, price_updated_at = ?,
        price_receipt_id = case when ? then null else price_receipt_id end, on_list = ?, category_id = ?, aisle = ?, changed_at = ? where id = ?`).run(
        b.name !== undefined ? String(b.name).trim() : cur.name,
        b.storeId ?? cur.store_id,
        b.usualQty ?? cur.usual_qty,
        price, source, priceAt, clearReceipt ? 1 : 0,
        b.onList !== undefined ? (b.onList ? 1 : 0) : cur.on_list,
        b.categoryId !== undefined ? b.categoryId : cur.category_id,
        aisle, now, id,
      );
    } catch {
      return res.status(409).json({ error: 'item already exists in this store' });
    }
    res.json(toItem(get(id)!));
  });

  r.post('/:id/photo', upload.single('photo'), async (req, res) => {
    const id = Number(req.params.id);
    if (!get(id)) return res.status(404).json({ error: 'not found' });
    if (!req.file) return res.status(400).json({ error: 'photo required' });
    try {
      const name = await saveItemPhoto(dataDir, req.file.buffer);
      db.prepare('update items set photo = ? where id = ?').run(name, id);
      res.json(toItem(get(id)!));
    } catch {
      res.status(400).json({ error: 'not a readable image' });
    }
  });

  r.delete('/:id', (req, res) => {
    db.prepare('delete from items where id = ?').run(Number(req.params.id));
    res.status(204).end();
  });
  return r;
}
