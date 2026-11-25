import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { transaction, type Db } from '../db';
import { saveReceiptPhoto } from '../lib/photos';
import { parseReceiptText, normalizeLabel } from '../lib/receipt';
import { proposeMatches } from '../lib/match';
import { readReceiptText as defaultOcr } from '../lib/ocr';

type Ocr = (imagePath: string) => Promise<string>;

export function receiptsRouter(db: Db, dataDir: string, ocr: Ocr = defaultOcr): Router {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  r.post('/', upload.single('photo'), async (req, res) => {
    const storeId = Number(req.body?.storeId);
    if (!db.prepare('select 1 from stores where id = ?').get(storeId)) return res.status(400).json({ error: 'unknown store' });
    if (!req.file) return res.status(400).json({ error: 'photo required' });
    let photo: string;
    try {
      photo = await saveReceiptPhoto(dataDir, req.file.buffer);
    } catch {
      return res.status(400).json({ error: 'not a readable image' });
    }
    let text: string;
    try {
      text = await ocr(path.join(dataDir, 'photos', photo));
    } catch (err) {
      console.error('Receipt reading failed:', err);
      fs.rmSync(path.join(dataDir, 'photos', photo), { force: true });
      return res.status(503).json({ error: 'Receipt reading is not working on the server right now. Check the server log.' });
    }
    const parsed = parseReceiptText(text);
    const items = db.prepare('select id, name from items where store_id = ? and archived_at is null').all(storeId) as { id: number; name: string }[];
    const aliases = db.prepare(
      'select a.item_id as itemId, a.label from aliases a join items i on i.id = a.item_id where i.store_id = ? and i.archived_at is null',
    ).all(storeId) as { itemId: number; label: string }[];
    const proposals = proposeMatches(parsed, items, aliases);
    const defaultSize = new Map(
      (db.prepare('select s.item_id as itemId, s.id from sizes s join items i on i.id = s.item_id where i.store_id = ? and s.is_default = 1').all(storeId) as { itemId: number; id: number }[])
        .map((z) => [z.itemId, z.id]),
    );

    const create = transaction(db, () => {
      const rid = Number(db.prepare("insert into receipts(store_id, created_at, status, raw_text, photo) values (?, ?, 'pending', ?, ?)")
        .run(storeId, new Date().toISOString(), text, photo).lastInsertRowid);
      return {
        rid,
        lines: parsed.map((l, i) => ({
          id: Number(db.prepare('insert into receipt_lines(receipt_id, raw_text, price_cents) values (?, ?, ?)').run(rid, l.raw, l.priceCents).lastInsertRowid),
          raw: l.raw,
          priceCents: l.priceCents,
          proposedItemId: proposals[i].itemId,
          proposedSizeId: proposals[i].itemId === null ? null : defaultSize.get(proposals[i].itemId!) ?? null,
          reason: proposals[i].reason,
        })),
      };
    });
    const { rid, lines } = create();
    res.status(201).json({ id: rid, storeId, status: 'pending', readable: lines.length > 0, lines });
  });

  r.post('/:id/confirm', (req, res) => {
    const receipt = db.prepare('select * from receipts where id = ?').get(Number(req.params.id)) as
      | { id: number; store_id: number; status: string; created_at: string } | undefined;
    if (!receipt) return res.status(404).json({ error: 'not found' });
    if (receipt.status === 'confirmed') return res.status(409).json({ error: 'already confirmed' });
    type Match = { lineId: number; itemId: number | null; sizeId?: number; weightLb?: number };
    const matches = Array.isArray(req.body?.matches) ? (req.body.matches as Match[]) : [];

    const lineStmt = db.prepare('select * from receipt_lines where id = ? and receipt_id = ?');
    const itemStmt = db.prepare('select store_id from items where id = ?');
    const sizeStmt = db.prepare('select id, sold_by from sizes where id = ? and item_id = ?');
    for (const m of matches) {
      if (m.itemId === null || m.itemId === undefined) continue;
      const item = itemStmt.get(m.itemId) as { store_id: number } | undefined;
      if (!lineStmt.get(m.lineId, receipt.id)) return res.status(400).json({ error: 'unknown line' });
      if (!item || item.store_id !== receipt.store_id) return res.status(400).json({ error: "item is not in this receipt's store" });
      if (!sizeStmt.get(m.sizeId ?? 0, m.itemId)) return res.status(400).json({ error: 'size does not belong to this item' });
    }

    let updated = 0;
    transaction(db, () => {
      for (const m of matches) {
        if (m.itemId === null || m.itemId === undefined) continue;
        const line = lineStmt.get(m.lineId, receipt.id) as { raw_text: string; price_cents: number };
        const size = sizeStmt.get(m.sizeId!, m.itemId) as { id: number; sold_by: 'each' | 'weight' };
        // Anti-goal: a by-weight size with no usable weight keeps its price rather than getting a wrong one.
        const weight = typeof m.weightLb === 'number' && Number.isFinite(m.weightLb) && m.weightLb > 0 ? m.weightLb : null;
        const price = size.sold_by === 'each' ? line.price_cents : weight === null ? null : Math.round(line.price_cents / weight);
        if (price !== null) {
          db.prepare("update sizes set last_price_cents = ?, price_source = 'receipt', price_receipt_id = ?, price_updated_at = ? where id = ?")
            .run(price, receipt.id, receipt.created_at, size.id);
        }
        // Ruling 10: list_amount resets when the item leaves the list; list_size_id stays.
        db.prepare('update items set on_list = 0, list_amount = null, changed_at = ? where id = ?').run(new Date().toISOString(), m.itemId);
        db.prepare('update receipt_lines set item_id = ? where id = ?').run(m.itemId, m.lineId);
        const label = normalizeLabel(line.raw_text);
        if (label) db.prepare('insert or ignore into aliases(item_id, label) values (?, ?)').run(m.itemId, label);
        updated++;
      }
      db.prepare("update receipts set status = 'confirmed' where id = ?").run(receipt.id);
    })();
    res.json({ updated });
  });
  return r;
}
