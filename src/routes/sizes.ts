import { Router } from 'express';
import { transaction, type Db } from '../db';
import { isIntOrNull, isPositive, parseSizeInput, toSize, type SizeRow } from './items';

export function sizesRouter(db: Db): Router {
  const r = Router();
  const find = (id: number) => db.prepare('select * from sizes where id = ?').get(id) as SizeRow | undefined;
  const touch = (itemId: number, now: string) => db.prepare('update items set changed_at = ? where id = ?').run(now, itemId);
  const taken = (itemId: number, name: string, exceptId: number) =>
    db.prepare('select 1 from sizes where item_id = ? and name = ? collate nocase and id != ?').get(itemId, name, exceptId);

  r.post('/items/:id/sizes', (req, res) => {
    const itemId = Number(req.params.id);
    if (!db.prepare('select 1 from items where id = ?').get(itemId)) return res.status(404).json({ error: 'not found' });
    const s = parseSizeInput(req.body);
    if (typeof s === 'string') return res.status(400).json({ error: s });
    if (taken(itemId, s.name, 0)) return res.status(409).json({ error: 'this staple already has a size with that name' });
    const now = new Date().toISOString();
    const id = transaction(db, () => {
      const { top } = db.prepare('select coalesce(max(sort), -1) as top from sizes where item_id = ?').get(itemId) as { top: number };
      if (s.isDefault) db.prepare('update sizes set is_default = 0 where item_id = ?').run(itemId);
      const hasDefault = db.prepare('select 1 from sizes where item_id = ? and is_default = 1').get(itemId);
      const sid = Number(db.prepare(`insert into sizes(item_id, name, sold_by, last_price_cents, price_source, price_updated_at, usual_amount, is_default, sort)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(itemId, s.name, s.soldBy, s.price, s.price === null ? null : 'manual', s.price === null ? null : now, s.amount, s.isDefault || !hasDefault ? 1 : 0, top + 1).lastInsertRowid);
      touch(itemId, now);
      return sid;
    })();
    res.status(201).json(toSize(find(id)!));
  });

  r.patch('/sizes/:id', (req, res) => {
    const cur = find(Number(req.params.id));
    if (!cur) return res.status(404).json({ error: 'not found' });
    const b = req.body ?? {};
    if (b.name !== undefined && typeof b.name !== 'string') return res.status(400).json({ error: 'invalid size name' });
    if (b.soldBy !== undefined && b.soldBy !== 'each' && b.soldBy !== 'weight') return res.status(400).json({ error: 'invalid soldBy' });
    if (b.lastPriceCents !== undefined && !isIntOrNull(b.lastPriceCents)) return res.status(400).json({ error: 'invalid lastPriceCents' });
    if (b.usualAmount !== undefined && !isPositive(b.usualAmount)) return res.status(400).json({ error: 'invalid usualAmount' });
    if (b.isDefault !== undefined && typeof b.isDefault !== 'boolean') return res.status(400).json({ error: 'invalid isDefault' });
    if (b.isDefault === false && cur.is_default === 1) return res.status(400).json({ error: 'make another size the default instead' });
    const name = b.name !== undefined ? b.name.trim() : cur.name;
    if (taken(cur.item_id, name, cur.id)) return res.status(409).json({ error: 'this staple already has a size with that name' });

    const now = new Date().toISOString();
    let { last_price_cents: price, price_source: source, price_updated_at: priceAt, price_receipt_id: receiptId } = cur;
    const soldBy = b.soldBy ?? cur.sold_by;
    const soldByChanged = soldBy !== cur.sold_by;
    // Ruling 8: changing how it is sold clears the price, then any price sent in the same request applies.
    if (soldByChanged) { price = null; source = null; priceAt = null; receiptId = null; }
    if (b.lastPriceCents !== undefined) {
      price = b.lastPriceCents;
      source = price === null ? null : 'manual';
      priceAt = price === null ? null : now;
      receiptId = null;
    }
    transaction(db, () => {
      if (b.isDefault === true && cur.is_default !== 1) db.prepare('update sizes set is_default = 0 where item_id = ?').run(cur.item_id);
      db.prepare(`update sizes set name = ?, sold_by = ?, last_price_cents = ?, price_source = ?, price_updated_at = ?, price_receipt_id = ?,
        usual_amount = ?, is_default = ? where id = ?`).run(
        name, soldBy, price, source, priceAt, receiptId, b.usualAmount ?? cur.usual_amount,
        b.isDefault === true ? 1 : cur.is_default, cur.id,
      );
      if (soldByChanged) db.prepare('update items set list_amount = null where list_size_id = ?').run(cur.id);
      touch(cur.item_id, now);
    })();
    res.json(toSize(find(cur.id)!));
  });

  r.delete('/sizes/:id', (req, res) => {
    const cur = find(Number(req.params.id));
    if (!cur) return res.status(404).json({ error: 'not found' });
    const { n } = db.prepare('select count(*) as n from sizes where item_id = ?').get(cur.item_id) as { n: number };
    if (n <= 1) return res.status(409).json({ error: 'A staple needs at least one size' });
    const now = new Date().toISOString();
    transaction(db, () => {
      // The next default is the first remaining size when the default itself is deleted.
      const heir = (cur.is_default === 1
        ? db.prepare('select id from sizes where item_id = ? and id != ? order by sort, id limit 1').get(cur.item_id, cur.id)
        : db.prepare('select id from sizes where item_id = ? and is_default = 1').get(cur.item_id)) as { id: number };
      // Ruling 7: a list that used the deleted size moves onto the default size.
      db.prepare('update items set list_size_id = ?, list_amount = null where list_size_id = ?').run(heir.id, cur.id);
      db.prepare('delete from sizes where id = ?').run(cur.id);
      if (cur.is_default === 1) db.prepare('update sizes set is_default = 1 where id = ?').run(heir.id);
      touch(cur.item_id, now);
    })();
    res.status(204).end();
  });
  return r;
}
