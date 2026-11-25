import { Router } from 'express';
import { transaction, type Db } from '../db';
import { buildList } from '../lib/list';
import { parseDollars } from '../lib/money';
import { sizesByItem, type ItemRow } from './items';

export function listRouter(db: Db): Router {
  const r = Router();
  r.get('/:id/list', (req, res) => {
    const store = db.prepare('select * from stores where id = ?').get(Number(req.params.id)) as
      | { id: number; name: string; is_main: number; color: string } | undefined;
    if (!store) return res.status(404).json({ error: 'store not found' });
    const budgetCents = typeof req.query.budget === 'string' ? parseDollars(req.query.budget) : null;
    // Minimal bridge until the sizes-aware list (task 2): price and amount come from the list size, else the default size.
    const rows = db.prepare('select * from items where store_id = ? and archived_at is null order by name collate nocase').all(store.id) as ItemRow[];
    const sizes = sizesByItem(db, rows.map((i) => i.id));
    const items = rows.map((i) => {
      const all = sizes.get(i.id) ?? [];
      const size = all.find((s) => s.id === i.list_size_id) ?? all[0];
      return {
        id: i.id, name: i.name, photo: i.photo, usualQty: i.list_amount ?? size?.usual_amount ?? 1, lastPriceCents: size?.last_price_cents ?? null,
        onList: i.on_list === 1, categoryId: i.category_id, aisle: i.aisle,
      };
    });
    res.json({ store: { id: store.id, name: store.name, isMain: store.is_main === 1, color: store.color }, budgetCents, ...buildList(items, budgetCents) });
  });
  r.post('/:id/finish', (req, res) => {
    const storeId = Number(req.params.id);
    if (!db.prepare('select 1 from stores where id = ?').get(storeId)) return res.status(404).json({ error: 'store not found' });
    const ids: unknown = req.body?.itemIds;
    if (!Array.isArray(ids) || !ids.every((i) => Number.isInteger(i))) return res.status(400).json({ error: 'itemIds must be an array of ids' });
    const unique = [...new Set(ids as number[])];
    const inStore = db.prepare('select 1 from items where id = ? and store_id = ?');
    if (!unique.every((id) => inStore.get(id, storeId))) return res.status(400).json({ error: 'item is not in this store' });
    const now = new Date().toISOString();
    const upd = db.prepare('update items set on_list = 0, changed_at = ? where id = ? and store_id = ?');
    transaction(db, () => { for (const id of unique) upd.run(now, id, storeId); })();
    res.json({ finished: unique.length });
  });
  return r;
}
