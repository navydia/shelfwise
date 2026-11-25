import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeApp } from './helpers/app';

describe('stores API', () => {
  it('create_store_defaults_to_tomato', async () => {
    const { api } = makeApp();
    const res = await api.post('/api/stores').send({ name: 'Main' });
    expect(res.status).toBe(201);
    expect(res.body.color).toBe('tomato');
    const teal = await api.post('/api/stores').send({ name: 'Deli', color: 'teal' });
    expect(teal.body.color).toBe('teal');
  });
  it('create_store_bad_colour_400', async () => {
    const { api } = makeApp();
    const res = await api.post('/api/stores').send({ name: 'Main', color: 'pink' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown colour');
  });
  it('patch_store_colour_and_name', async () => {
    const { api } = makeApp();
    const s = (await api.post('/api/stores').send({ name: 'Main' })).body;
    const res = await api.patch(`/api/stores/${s.id}`).send({ name: 'Market', color: 'green' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: s.id, name: 'Market', color: 'green', isMain: false });
    expect((await api.patch(`/api/stores/${s.id}`).send({ color: 'nope' })).status).toBe(400);
    expect((await api.patch('/api/stores/999').send({ name: 'X' })).status).toBe(404);
    await api.post('/api/stores').send({ name: 'Deli' });
    expect((await api.patch(`/api/stores/${s.id}`).send({ name: 'Deli' })).status).toBe(409);
  });
  it('patch_is_main_moves_main_flag', async () => {
    const { api } = makeApp();
    const a = (await api.post('/api/stores').send({ name: 'Main', isMain: true })).body;
    const b = (await api.post('/api/stores').send({ name: 'Deli' })).body;
    const res = await api.patch(`/api/stores/${b.id}`).send({ isMain: true });
    expect(res.body.isMain).toBe(true);
    const all = (await api.get('/api/stores')).body;
    expect(all.filter((s: { isMain: boolean }) => s.isMain).map((s: { id: number }) => s.id)).toEqual([b.id]);
    expect(all.find((s: { id: number }) => s.id === a.id).isMain).toBe(false);
  });
  it('patch_is_main_false_400', async () => {
    const { api } = makeApp();
    const a = (await api.post('/api/stores').send({ name: 'Main', isMain: true })).body;
    const res = await api.patch(`/api/stores/${a.id}`).send({ isMain: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('make another store main instead');
  });
  it('delete_store_with_staples_409_reports_count', async () => {
    const { api } = makeApp();
    await api.post('/api/stores').send({ name: 'Main', isMain: true });
    const b = (await api.post('/api/stores').send({ name: 'Deli' })).body;
    await api.post('/api/items').send({ name: 'Olives', storeId: b.id });
    await api.post('/api/items').send({ name: 'Feta', storeId: b.id });
    const res = await api.delete(`/api/stores/${b.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Move or delete its 2 staples first', staples: 2 });
  });
  it('delete_main_store_409', async () => {
    const { api } = makeApp();
    const a = (await api.post('/api/stores').send({ name: 'Main', isMain: true })).body;
    const res = await api.delete(`/api/stores/${a.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'make another store main first' });
    expect((await api.delete('/api/stores/999')).status).toBe(404);
  });
  it('delete_empty_store_removes_receipts_and_photos', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelfwise-'));
    const { api, db } = makeApp({ dataDir });
    await api.post('/api/stores').send({ name: 'Main', isMain: true });
    const b = (await api.post('/api/stores').send({ name: 'Deli' })).body;
    const file = path.join(dataDir, 'photos', 'r1.jpg');
    fs.writeFileSync(file, 'x');
    const rid = Number(db.prepare("insert into receipts(store_id, created_at, status, raw_text, photo) values (?, ?, 'confirmed', '', 'r1.jpg')")
      .run(b.id, new Date().toISOString()).lastInsertRowid);
    db.prepare("insert into receipt_lines(receipt_id, raw_text, price_cents) values (?, 'milk', 100)").run(rid);
    const res = await api.delete(`/api/stores/${b.id}`);
    expect(res.status).toBe(204);
    expect(db.prepare('select count(*) c from receipts').get()).toEqual({ c: 0 });
    expect(db.prepare('select count(*) c from receipt_lines').get()).toEqual({ c: 0 });
    expect(db.prepare('select count(*) c from stores where id = ?').get(b.id)).toEqual({ c: 0 });
    expect(fs.existsSync(file)).toBe(false);
  });
});
