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
  it('confirm_updates_price_source_and_takes_off_list', async () => {
    let text = 'EGGS 3.99';
    const { upload, api, db, eggs, store } = await setup(() => text);
    const itemFrom = async () => (await api.get(`/api/items?storeId=${store.id}`)).body.find((i: { id: number }) => i.id === eggs.id);
    await api.patch(`/api/items/${eggs.id}`).send({ onList: true });

    const first = (await upload()).body;
    const firstLine = first.lines.find((l: { raw: string }) => l.raw === 'EGGS 3.99');
    await api.post(`/api/receipts/${first.id}/confirm`).send({ matches: [{ lineId: firstLine.id, itemId: eggs.id, sizeId: (await itemFrom()).sizes[0].id }] });
    const firstAt = (db.prepare('select created_at from receipts where id = ?').get(first.id) as { created_at: string }).created_at;
    expect(await itemFrom()).toMatchObject({ onList: false });
    expect((await itemFrom()).sizes[0]).toMatchObject({ lastPriceCents: 399, priceSource: 'receipt', priceDate: firstAt });
    const row = () => db.prepare('select s.price_receipt_id, i.changed_at from items i join sizes s on s.item_id = i.id and s.is_default = 1 where i.id = ?').get(eggs.id) as { price_receipt_id: number; changed_at: string };
    const afterFirst = row();
    expect(afterFirst.price_receipt_id).toBe(first.id);

    const sizeId = (await itemFrom()).sizes[0].id;
    await api.patch(`/api/sizes/${sizeId}`).send({ lastPriceCents: 500 });
    expect((await itemFrom()).sizes[0]).toMatchObject({ lastPriceCents: 500, priceSource: 'manual' });

    text = 'EGGS 4.25';
    await api.patch(`/api/items/${eggs.id}`).send({ onList: true });
    const second = (await upload()).body;
    const secondLine = second.lines.find((l: { raw: string }) => l.raw === 'EGGS 4.25');
    await api.post(`/api/receipts/${second.id}/confirm`).send({ matches: [{ lineId: secondLine.id, itemId: eggs.id, sizeId }] });
    const secondAt = (db.prepare('select created_at from receipts where id = ?').get(second.id) as { created_at: string }).created_at;
    expect(await itemFrom()).toMatchObject({ onList: false });
    expect((await itemFrom()).sizes[0]).toMatchObject({ lastPriceCents: 425, priceSource: 'receipt', priceDate: secondAt });
    const afterSecond = row();
    expect(afterSecond.price_receipt_id).toBe(second.id);
    expect(afterSecond.changed_at).not.toBe(afterFirst.changed_at);
  });
  it('unmatched_lines_change_nothing', async () => {
    const { upload, api, db } = await setup();
    const up = (await upload()).body;
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: up.lines.map((l: { id: number }) => ({ lineId: l.id, itemId: null })) });
    expect(res.status).toBe(200);
    expect(db.prepare('select count(*) c from aliases').get()).toEqual({ c: 0 });
    expect(db.prepare('select count(*) c from sizes where last_price_cents is not null').get()).toEqual({ c: 0 });
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
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [{ lineId: up.lines[0].id, itemId: foreign.id, sizeId: foreign.sizes[0].id }] });
    expect(res.status).toBe(400);
  });
  it('next_receipt_uses_saved_alias', async () => {
    const { upload, api, bananas } = await setup();
    const first = (await upload()).body;
    const line = first.lines.find((l: { raw: string }) => l.raw === 'ORG BNNA 1.29');
    await api.post(`/api/receipts/${first.id}/confirm`).send({ matches: [{ lineId: line.id, itemId: bananas.id, sizeId: bananas.sizes[0].id }] });
    const second = (await upload()).body;
    const again = second.lines.find((l: { raw: string }) => l.raw === 'ORG BNNA 1.29');
    expect(again).toMatchObject({ proposedItemId: bananas.id, reason: 'alias' });
  });
});

describe('receipts API: sizes', () => {
  async function sized(text: string) {
    const s = await setup(text);
    const weightSize = (await s.api.post(`/api/items/${s.bananas.id}/sizes`).send({ name: 'Loose', soldBy: 'weight' })).body;
    return { ...s, weightSize };
  }
  const sizeOf = (db: any, id: number) => db.prepare('select * from sizes where id = ?').get(id) as { last_price_cents: number | null; price_source: string | null };

  it('confirm_each_sets_size_price', async () => {
    const { upload, api, db, eggs } = await setup('EGGS 3.99');
    await api.patch(`/api/items/${eggs.id}`).send({ onList: true, listAmount: 3 });
    const up = (await upload()).body;
    const second = (await api.post(`/api/items/${eggs.id}/sizes`).send({ name: 'Dozen', soldBy: 'each' })).body;
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [{ lineId: up.lines[0].id, itemId: eggs.id, sizeId: second.id }] });
    expect(res.status).toBe(200);
    expect(sizeOf(db, second.id)).toMatchObject({ last_price_cents: 399, price_source: 'receipt' });
    expect(sizeOf(db, eggs.sizes[0].id).last_price_cents).toBeNull();
    expect(db.prepare('select on_list, list_amount from items where id = ?').get(eggs.id)).toEqual({ on_list: 0, list_amount: null });
  });
  it('weight_match_divides', async () => {
    const { upload, api, db, bananas, weightSize } = await sized('BANANAS 3.00');
    const up = (await upload()).body;
    await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [{ lineId: up.lines[0].id, itemId: bananas.id, sizeId: weightSize.id, weightLb: 4 }] });
    expect(sizeOf(db, weightSize.id)).toMatchObject({ last_price_cents: 75, price_source: 'receipt' });
  });
  it('weight_match_without_weight_keeps_price', async () => {
    const { upload, api, db, bananas, weightSize } = await sized('BANANAS 3.00');
    await api.patch(`/api/sizes/${weightSize.id}`).send({ lastPriceCents: 60 });
    const up = (await upload()).body;
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [{ lineId: up.lines[0].id, itemId: bananas.id, sizeId: weightSize.id }] });
    expect(res.body).toEqual({ updated: 1 });
    expect(sizeOf(db, weightSize.id)).toMatchObject({ last_price_cents: 60, price_source: 'manual' });
    expect(db.prepare('select item_id from receipt_lines where id = ?').get(up.lines[0].id)).toEqual({ item_id: bananas.id });
  });
  it('confirm_size_must_belong_400', async () => {
    const { upload, api, db, bananas, eggs } = await setup('EGGS 3.99');
    const up = (await upload()).body;
    const res = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [{ lineId: up.lines[0].id, itemId: eggs.id, sizeId: bananas.sizes[0].id }] });
    expect(res.status).toBe(400);
    const none = await api.post(`/api/receipts/${up.id}/confirm`).send({ matches: [{ lineId: up.lines[0].id, itemId: eggs.id }] });
    expect(none.status).toBe(400);
    expect(db.prepare('select status from receipts where id = ?').get(up.id)).toEqual({ status: 'pending' });
  });
  it('proposals_skip_archived', async () => {
    const { upload, api, eggs } = await setup('EGGS 3.99');
    await api.patch(`/api/items/${eggs.id}`).send({ archived: true });
    const up = (await upload()).body;
    expect(up.lines[0].proposedItemId).toBeNull();
    expect(up.lines[0].proposedSizeId).toBeNull();
  });
  it('proposal_has_default_size', async () => {
    const { upload, eggs } = await setup('EGGS 3.99');
    const up = (await upload()).body;
    expect(up.lines[0]).toMatchObject({ proposedItemId: eggs.id, proposedSizeId: eggs.sizes[0].id });
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
