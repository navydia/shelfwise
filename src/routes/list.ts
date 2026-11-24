import { Router } from 'express';
import type { Db } from '../db';
import { buildList } from '../lib/list';
import { parseDollars } from '../lib/money';
import { toItem, type ItemRow } from './items';

export function listRouter(db: Db): Router {
  const r = Router();
  r.get('/:id/list', (req, res) => {
    const store = db.prepare('select * from stores where id = ?').get(Number(req.params.id)) as
      | { id: number; name: string; is_main: number; color: string } | undefined;
    if (!store) return res.status(404).json({ error: 'store not found' });
    const budgetCents = typeof req.query.budget === 'string' ? parseDollars(req.query.budget) : null;
    const items = (db.prepare('select * from items where store_id = ? order by name collate nocase').all(store.id) as ItemRow[])
      .map(toItem)
      .map((i) => ({ id: i.id, name: i.name, photo: i.photo, usualQty: i.usualQty, lastPriceCents: i.lastPriceCents, onList: i.onList, categoryId: i.categoryId, aisle: i.aisle }));
    res.json({ store: { id: store.id, name: store.name, isMain: store.is_main === 1, color: store.color }, budgetCents, ...buildList(items, budgetCents) });
  });
  return r;
}
