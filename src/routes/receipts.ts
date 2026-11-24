import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import type { Db } from '../db';
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
    let text = '';
    try {
      text = await ocr(path.join(dataDir, 'photos', photo));
    } catch {
      text = '';
    }
    const parsed = parseReceiptText(text);
    const items = db.prepare('select id, name from items where store_id = ?').all(storeId) as { id: number; name: string }[];
    const aliases = db.prepare(
      'select a.item_id as itemId, a.label from aliases a join items i on i.id = a.item_id where i.store_id = ?',
    ).all(storeId) as { itemId: number; label: string }[];
    const proposals = proposeMatches(parsed, items, aliases);

    const create = db.transaction(() => {
      const rid = Number(db.prepare("insert into receipts(store_id, created_at, status, raw_text, photo) values (?, ?, 'pending', ?, ?)")
        .run(storeId, new Date().toISOString(), text, photo).lastInsertRowid);
      return {
        rid,
        lines: parsed.map((l, i) => ({
          id: Number(db.prepare('insert into receipt_lines(receipt_id, raw_text, price_cents) values (?, ?, ?)').run(rid, l.raw, l.priceCents).lastInsertRowid),
          raw: l.raw,
          priceCents: l.priceCents,
          proposedItemId: proposals[i].itemId,
          reason: proposals[i].reason,
        })),
      };
    });
    const { rid, lines } = create();
    res.status(201).json({ id: rid, storeId, status: 'pending', readable: lines.length > 0, lines });
  });

  r.post('/:id/confirm', (req, res) => {
    const receipt = db.prepare('select * from receipts where id = ?').get(Number(req.params.id)) as
      | { id: number; store_id: number; status: string } | undefined;
    if (!receipt) return res.status(404).json({ error: 'not found' });
    if (receipt.status === 'confirmed') return res.status(409).json({ error: 'already confirmed' });
    const matches = Array.isArray(req.body?.matches) ? (req.body.matches as { lineId: number; itemId: number | null }[]) : [];

    const lineStmt = db.prepare('select * from receipt_lines where id = ? and receipt_id = ?');
    const itemStmt = db.prepare('select store_id from items where id = ?');
    for (const m of matches) {
      if (m.itemId === null || m.itemId === undefined) continue;
      const item = itemStmt.get(m.itemId) as { store_id: number } | undefined;
      if (!lineStmt.get(m.lineId, receipt.id)) return res.status(400).json({ error: 'unknown line' });
      if (!item || item.store_id !== receipt.store_id) return res.status(400).json({ error: 'item is not in this receipt\'s store' });
    }

    let updated = 0;
    db.transaction(() => {
      for (const m of matches) {
        if (m.itemId === null || m.itemId === undefined) continue;
        const line = lineStmt.get(m.lineId, receipt.id) as { raw_text: string; price_cents: number };
        db.prepare("update items set last_price_cents = ?, state = 'stocked', on_list = 0 where id = ?").run(line.price_cents, m.itemId);
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
