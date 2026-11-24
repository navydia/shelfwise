import { describe, it, expect, afterEach } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeApp } from './helpers/app';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const img = () => sharp({ create: { width: 400, height: 600, channels: 3, background: '#fff' } }).png().toBuffer();

async function setup(ocrText: string | (() => string) = 'ORG BNNA 1.29\nEGGS 3.99\nMYSTERY 2.00\nTOTAL 7.28') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-r-')); dirs.push(dir);
  const t = makeApp({ dataDir: dir, readReceiptText: async () => (typeof ocrText === 'function' ? ocrText() : ocrText) });
  const store = (await t.api.post('/api/stores').send({ name: 'Main', isMain: true })).body;
  const other = (await t.api.post('/api/stores').send({ name: 'Other' })).body;
  const bananas = (await t.api.post('/api/items').send({ name: 'Bananas', storeId: store.id })).body;
  const eggs = (await t.api.post('/api/items').send({ name: 'Eggs', storeId: store.id })).body;
  const foreign = (await t.api.post('/api/items').send({ name: 'Cheese', storeId: other.id })).body;
  const upload = async () =>
    t.api.post('/api/receipts').field('storeId', String(store.id)).attach('photo', await img(), 'r.png');
  return { ...t, store, bananas, eggs, foreign, upload };
}

describe('receipts API', () => {
  it('upload_returns_proposals', async () => {
    const { upload, eggs } = await setup();
    const res = await upload();
    expect(res.status).toBe(201);
    expect(res.body.readable).toBe(true);
    expect(res.body.status).toBe('pending');
    expect(res.body.lines).toHaveLength(3);
    const byRaw = Object.fromEntries(res.body.lines.map((l: { raw: string }) => [l.raw, l]));
    expect(byRaw['EGGS 3.99'].proposedItemId).toBe(eggs.id);
    expect(byRaw['ORG BNNA 1.29'].proposedItemId).toBeNull();
  });
  it('unreadable_receipt_returns_readable_false', async () => {
    const { upload } = await setup('');
    const res = await upload();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ readable: false, lines: [] });
  });
  it('confirm_updates_price_alias_and_state', async () => {
    const { upload, api, db, bananas, eggs } = await setup();
    await api.patch(`/api/items/${eggs.id}`).send({ state: 'out' });
    const up = (await upload()).body;
    const lineOf = (raw: string) => up.lines.find((l: { raw: string }) => l.raw === raw).id;
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({
      matches: [{ lineId: lineOf('ORG BNNA 1.29'), itemId: bananas.id }, { lineId: lineOf('EGGS 3.99'), itemId: eggs.id }],
    });
    expect(res.status).toBe(200);
    const items = (await api.get('/api/items')).body as { id: number; lastPriceCents: number; state: string }[];
    expect(items.find((i) => i.id === bananas.id)!.lastPriceCents).toBe(129);
    const e = items.find((i) => i.id === eggs.id)!;
    expect(e.lastPriceCents).toBe(399);
    expect(e.state).toBe('stocked');
    expect(db.prepare('select label from aliases where item_id = ?').get(bananas.id)).toEqual({ label: 'org bnna' });
  });
  it('unmatched_lines_change_nothing', async () => {
    const { upload, api, db } = await setup();
    const up = (await upload()).body;
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: up.lines.map((l: { id: number }) => ({ lineId: l.id, itemId: null })) });
    expect(res.status).toBe(200);
    expect(db.prepare('select count(*) c from aliases').get()).toEqual({ c: 0 });
    expect(db.prepare('select count(*) c from items where last_price_cents is not null').get()).toEqual({ c: 0 });
  });
  it('confirm_twice_returns_409', async () => {
    const { upload, api } = await setup();
    const up = (await upload()).body;
    await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [] });
    expect((await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [] })).status).toBe(409);
  });
  it('item_from_other_store_returns_400', async () => {
    const { upload, api, foreign } = await setup();
    const up = (await upload()).body;
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [{ lineId: up.lines[0].id, itemId: foreign.id }] });
    expect(res.status).toBe(400);
  });
  it('next_receipt_uses_saved_alias', async () => {
    const { upload, api, bananas } = await setup();
    const first = (await upload()).body;
    const line = first.lines.find((l: { raw: string }) => l.raw === 'ORG BNNA 1.29');
    await api.post(`/api/receipts/${first.id}/confirm`).send({ matches: [{ lineId: line.id, itemId: bananas.id }] });
    const second = (await upload()).body;
    const again = second.lines.find((l: { raw: string }) => l.raw === 'ORG BNNA 1.29');
    expect(again).toMatchObject({ proposedItemId: bananas.id, reason: 'alias' });
  });
});

describe('receipts API: reader failure', () => {
  it('ocr_failure_returns_503_and_leaves_no_receipt_row', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-r-')); dirs.push(dir);
    const { api, db } = makeApp({ dataDir: dir, readReceiptText: async () => { throw new Error('tessdata download failed'); } });
    const store = (await api.post('/api/stores').send({ name: 'Main' })).body;
    const res = await api.post('/api/receipts').field('storeId', String(store.id)).attach('photo', await img(), 'r.png');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/receipt reading/i);
    expect(db.prepare('select count(*) c from receipts').get()).toEqual({ c: 0 });
    expect(fs.readdirSync(path.join(dir, 'photos'))).toHaveLength(0);
  });
});
