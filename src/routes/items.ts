import { Router } from 'express';
import multer from 'multer';
import { transaction, type Db } from '../db';
import { saveItemPhoto } from '../lib/photos';

export type ItemRow = {
  id: number; name: string; store_id: number; usual_qty: number;
  photo: string | null; on_list: number;
  category_id: number | null; aisle: string | null; changed_at: string;
  emoji: string | null; archived_at: string | null; list_size_id: number | null; list_amount: number | null;
};
export type SizeRow = {
  id: number; item_id: number; name: string; sold_by: 'each' | 'weight';
  last_price_cents: number | null; price_source: 'receipt' | 'manual' | null; price_receipt_id: number | null;
  price_updated_at: string | null; usual_amount: number; is_default: number; sort: number;
};
export const toSize = (s: SizeRow) => ({
  id: s.id, name: s.name, soldBy: s.sold_by, lastPriceCents: s.last_price_cents, priceSource: s.price_source,
  priceDate: s.price_updated_at, usualAmount: s.usual_amount, isDefault: s.is_default === 1,
});
export const toItem = (r: ItemRow, sizes: SizeRow[]) => ({
  id: r.id, name: r.name, storeId: r.store_id, onList: r.on_list === 1,
  photo: r.photo, emoji: r.emoji, archived: r.archived_at !== null,
  categoryId: r.category_id, aisle: r.aisle, changedAt: r.changed_at,
  sizes: sizes.map(toSize), listSizeId: r.list_size_id, listAmount: r.list_amount,
});

/** Sizes of the given items, default first, grouped by item id. */
export function sizesByItem(db: Db, itemIds: number[]): Map<number, SizeRow[]> {
  const by = new Map<number, SizeRow[]>();
  if (itemIds.length === 0) return by;
  const rows = db.prepare(`select * from sizes where item_id in (${itemIds.map(() => '?').join(',')}) order by is_default desc, sort, id`).all(...itemIds) as SizeRow[];
  for (const s of rows) {
    const list = by.get(s.item_id);
    if (list) list.push(s); else by.set(s.item_id, [s]);
  }
  return by;
}
export function itemsJson(db: Db, rows: ItemRow[]) {
  const by = sizesByItem(db, rows.map((r) => r.id));
  return rows.map((r) => toItem(r, by.get(r.id) ?? []));
}

const AISLE_MAX = 20;
const EMOJI_MAX_BYTES = 16;
export const isIntOrNull = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0);
export const isPositive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;

type SizeInput = { name: string; soldBy: 'each' | 'weight'; price: number | null; amount: number; isDefault: boolean };
/** Validates a size from a request body; returns an error message or the parsed size. */
export function parseSizeInput(raw: unknown): SizeInput | string {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.name !== undefined && typeof b.name !== 'string') return 'invalid size name';
  const soldBy = b.soldBy ?? 'each';
  if (soldBy !== 'each' && soldBy !== 'weight') return 'invalid soldBy';
  const price = b.lastPriceCents === undefined ? null : b.lastPriceCents;
  if (!isIntOrNull(price)) return 'invalid lastPriceCents';
  const amount = b.usualAmount === undefined ? 1 : b.usualAmount;
  if (!isPositive(amount)) return 'invalid usualAmount';
  return { name: String(b.name ?? '').trim(), soldBy, price: price as number | null, amount: amount as number, isDefault: b.isDefault === true };
}

export function itemsRouter(db: Db, dataDir: string): Router {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
  const get = (id: number) => db.prepare('select * from items where id = ?').get(id) as ItemRow | undefined;
  const json = (id: number) => itemsJson(db, [get(id)!])[0];
  const archivedClash = (storeId: number, name: string, exceptId = 0) =>
    db.prepare('select id, name from items where store_id = ? and name = ? collate nocase and archived_at is not null and id != ?')
      .get(storeId, name, exceptId) as { id: number; name: string } | undefined;
  const clashBody = (a: { id: number; name: string }) => ({ error: `An archived staple is called "${a.name}"`, archivedId: a.id });

  r.get('/', (req, res) => {
    const storeId = Number(req.query.storeId);
    const archived = req.query.archived === '1';
    const where = [archived ? 'archived_at is not null' : 'archived_at is null'];
    const args: number[] = [];
    if (Number.isInteger(storeId)) { where.push('store_id = ?'); args.push(storeId); }
    const rows = db.prepare(`select * from items where ${where.join(' and ')} order by name collate nocase`).all(...args) as ItemRow[];
    res.json(itemsJson(db, rows));
  });

  r.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const storeId = Number(req.body?.storeId);
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!db.prepare('select 1 from stores where id = ?').get(storeId)) return res.status(400).json({ error: 'unknown store' });
    const b = req.body ?? {};
    const categoryId = b.categoryId ?? null;
    if (categoryId !== null && !db.prepare('select 1 from categories where id = ?').get(categoryId)) return res.status(400).json({ error: 'unknown category' });
    const aisle = b.aisle === undefined || b.aisle === null ? null : String(b.aisle).trim() || null;
    if (aisle && aisle.length > AISLE_MAX) return res.status(400).json({ error: 'aisle is too long' });

    let sizes: SizeInput[];
    if (b.sizes === undefined) {
      const one = parseSizeInput({ lastPriceCents: b.lastPriceCents, usualAmount: b.usualQty });
      if (typeof one === 'string') return res.status(400).json({ error: one });
      sizes = [{ ...one, isDefault: true }];
    } else {
      if (!Array.isArray(b.sizes) || b.sizes.length === 0) return res.status(400).json({ error: 'sizes must be a non-empty array' });
      const parsed: SizeInput[] = [];
      for (const s of b.sizes) {
        const p = parseSizeInput(s);
        if (typeof p === 'string') return res.status(400).json({ error: p });
        parsed.push(p);
      }
      if (new Set(parsed.map((s) => s.name.toLowerCase())).size !== parsed.length) return res.status(400).json({ error: 'size names must be different' });
      const defaults = parsed.filter((s) => s.isDefault).length;
      if (defaults > 1) return res.status(400).json({ error: 'only one size can be the default' });
      if (defaults === 0) parsed[0].isDefault = true;
      sizes = parsed;
    }

    const clash = archivedClash(storeId, name);
    if (clash) return res.status(409).json(clashBody(clash));
    const now = new Date().toISOString();
    try {
      const id = transaction(db, () => {
        const itemId = Number(db.prepare('insert into items(name, store_id, category_id, aisle, on_list, changed_at) values (?, ?, ?, ?, ?, ?)')
          .run(name, storeId, categoryId, aisle, b.onList ? 1 : 0, now).lastInsertRowid);
        const ins = db.prepare(`insert into sizes(item_id, name, sold_by, last_price_cents, price_source, price_updated_at, usual_amount, is_default, sort)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        let defaultId = 0;
        sizes.forEach((s, i) => {
          const sid = Number(ins.run(itemId, s.name, s.soldBy, s.price, s.price === null ? null : 'manual', s.price === null ? null : now, s.amount, s.isDefault ? 1 : 0, i).lastInsertRowid);
          if (s.isDefault) defaultId = sid;
        });
        if (b.onList) db.prepare('update items set list_size_id = ? where id = ?').run(defaultId, itemId);
        return itemId;
      })();
      res.status(201).json(json(id));
    } catch {
      res.status(409).json({ error: 'item already exists in this store' });
    }
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const cur = get(id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const b = req.body ?? {};
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
    let emoji = cur.emoji;
    if (b.emoji !== undefined) {
      if (b.emoji !== null && typeof b.emoji !== 'string') return res.status(400).json({ error: 'invalid emoji' });
      if (b.emoji && Buffer.byteLength(b.emoji, 'utf8') > EMOJI_MAX_BYTES) return res.status(400).json({ error: 'emoji is too long' });
      emoji = b.emoji ? b.emoji : null;
    }
    if (b.listSizeId !== undefined && !db.prepare('select 1 from sizes where id = ? and item_id = ?').get(b.listSizeId, id)) return res.status(400).json({ error: 'size does not belong to this item' });
    if (b.listAmount !== undefined && !isPositive(b.listAmount)) return res.status(400).json({ error: 'invalid listAmount' });

    const now = new Date().toISOString();
    const archived = b.archived === undefined ? cur.archived_at !== null : b.archived === true;
    const archivedAt = b.archived === undefined ? cur.archived_at : archived ? (cur.archived_at ?? now) : null;
    let onList = b.onList !== undefined ? (b.onList ? 1 : 0) : cur.on_list;
    if (archived) {
      if (b.onList === true) return res.status(409).json({ error: 'Restore this staple before adding it to the list' });
      onList = 0;
    }
    // Ruling 10: the list size is remembered when the item leaves the list; the amount is not.
    let listSizeId = cur.list_size_id;
    let listAmount = cur.list_amount;
    if (b.listSizeId !== undefined && b.listSizeId !== cur.list_size_id) { listSizeId = b.listSizeId; listAmount = null; }
    if (cur.on_list === 1 && onList === 0) listAmount = null;
    if (b.listAmount !== undefined) listAmount = b.listAmount;
    if (onList === 1 && listSizeId === null) {
      listSizeId = (db.prepare('select id from sizes where item_id = ? and is_default = 1').get(id) as { id: number } | undefined)?.id ?? null;
    }
    const name = b.name !== undefined ? String(b.name).trim() : cur.name;
    const storeId = b.storeId ?? cur.store_id;
    const clash = archivedClash(storeId, name, id);
    if (clash) return res.status(409).json(clashBody(clash));
    try {
      db.prepare(`update items set name = ?, store_id = ?, on_list = ?, category_id = ?, aisle = ?, emoji = ?, archived_at = ?,
        list_size_id = ?, list_amount = ?, changed_at = ? where id = ?`).run(
        name, storeId, onList,
        b.categoryId !== undefined ? b.categoryId : cur.category_id,
        aisle, emoji, archivedAt, listSizeId, listAmount, now, id,
      );
    } catch {
      return res.status(409).json({ error: 'item already exists in this store' });
    }
    res.json(json(id));
  });

  r.post('/:id/photo', upload.single('photo'), async (req, res) => {
    const id = Number(req.params.id);
    if (!get(id)) return res.status(404).json({ error: 'not found' });
    if (!req.file) return res.status(400).json({ error: 'photo required' });
    try {
      const name = await saveItemPhoto(dataDir, req.file.buffer);
      db.prepare('update items set photo = ? where id = ?').run(name, id);
      res.json(json(id));
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
