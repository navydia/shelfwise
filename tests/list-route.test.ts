import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers/app';

async function setup() {
  const t = makeApp();
  const a = (await t.api.post('/api/stores').send({ name: 'Main', isMain: true })).body;
  const b = (await t.api.post('/api/stores').send({ name: 'Deli' })).body;
  const mk = async (name: string, storeId: number, patch: object) => {
    const { lastPriceCents, ...rest } = patch as { lastPriceCents?: number };
    const it = (await t.api.post('/api/items').send({ name, storeId, lastPriceCents })).body;
    return (await t.api.patch(`/api/items/${it.id}`).send(rest)).body;
  };
  return { ...t, a, b, mk };
}

describe('GET /api/stores/:id/list', () => {
  it('list_contains_only_that_stores_low_and_out_items', async () => {
    const { api, a, b, mk } = await setup();
    await mk('Rice', a.id, { onList: true, lastPriceCents: 300 });
    await mk('Salt', a.id, {});
    await mk('Olives', b.id, { onList: true, lastPriceCents: 500 });
    const res = await api.get(`/api/stores/${a.id}/list`);
    expect(res.status).toBe(200);
    expect(res.body.lines.map((l: { name: string }) => l.name)).toEqual(['Rice']);
    expect(res.body.store.name).toBe('Main');
  });
  it('list_applies_budget_status', async () => {
    const { api, a, mk } = await setup();
    await mk('Rice', a.id, { onList: true, lastPriceCents: 6000 });
    const res = await api.get(`/api/stores/${a.id}/list?budget=50`);
    expect(res.body).toMatchObject({ subtotalCents: 6000, budgetCents: 5000, status: 'over' });
  });
  it('invalid_budget_is_ignored', async () => {
    const { api, a } = await setup();
    const res = await api.get(`/api/stores/${a.id}/list?budget=abc`);
    expect(res.body.budgetCents).toBeNull();
    expect(res.body.status).toBe('none');
  });
  it('unknown_store_404', async () => {
    const { api } = await setup();
    expect((await api.get('/api/stores/999/list')).status).toBe(404);
  });
});

describe('POST /api/stores/:id/finish', () => {
  it('finish_takes_items_off_list', async () => {
    const { api, a, mk } = await setup();
    const rice = await mk('Rice', a.id, { onList: true, lastPriceCents: 300 });
    const salt = await mk('Salt', a.id, { onList: true, lastPriceCents: 100 });
    const res = await api.post(`/api/stores/${a.id}/finish`).send({ itemIds: [rice.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ finished: 1 });
    const list = (await api.get(`/api/stores/${a.id}/list`)).body;
    expect(list.lines.map((l: { name: string }) => l.name)).toEqual([salt.name]);
    expect((await api.post(`/api/stores/${a.id}/finish`).send({ itemIds: [] })).body).toEqual({ finished: 0 });
  });
  it('finish_rejects_items_from_other_store', async () => {
    const { api, a, b, mk } = await setup();
    const rice = await mk('Rice', a.id, { onList: true, lastPriceCents: 300 });
    const olives = await mk('Olives', b.id, { onList: true });
    const res = await api.post(`/api/stores/${a.id}/finish`).send({ itemIds: [rice.id, olives.id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('item is not in this store');
    const list = (await api.get(`/api/stores/${a.id}/list`)).body;
    expect(list.lines.map((l: { name: string }) => l.name)).toEqual(['Rice']);
  });
});

describe('one-offs and sizes on the list', () => {
  it('list_includes_oneoffs_and_staple_sizes', async () => {
    const { api, a, mk } = await setup();
    const milk = await mk('Milk', a.id, { onList: true, lastPriceCents: 399 });
    const big = (await api.post(`/api/items/${milk.id}/sizes`).send({ name: 'Gallon', lastPriceCents: 599, usualAmount: 2 })).body;
    await api.patch(`/api/items/${milk.id}`).send({ listSizeId: big.id });
    const beef = await mk('Beef', a.id, { onList: true });
    const lb = (await api.patch(`/api/sizes/${beef.sizes[0].id}`).send({ soldBy: 'weight', lastPriceCents: 249, usualAmount: 2.35 })).body;
    await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'Candles', priceCents: 349, amount: 2 });
    await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'Foil' });
    const get = async () => (await api.get(`/api/stores/${a.id}/list`)).body;
    const res = await get();
    expect(Object.keys(res).sort()).toEqual(['budgetCents', 'lines', 'status', 'store', 'subtotalCents', 'unpriced']);
    const by = (r: { lines: { name: string }[]; unpriced: { name: string }[] }, n: string) => [...r.lines, ...r.unpriced].find((l) => l.name === n);
    expect(by(res, 'Milk')).toMatchObject({ kind: 'staple', id: milk.id, sizeId: big.id, sizeName: 'Gallon', soldBy: 'each', unitPriceCents: 599, amount: 2, lineCents: 1198 });
    expect(by(res, 'Beef')).toMatchObject({ sizeId: lb.id, soldBy: 'weight', unitPriceCents: 249, amount: 2.35, lineCents: 585 });
    expect(by(res, 'Candles')).toMatchObject({ kind: 'oneoff', sizeId: null, sizeName: '', soldBy: 'each', unitPriceCents: 349, amount: 2, lineCents: 698, categoryId: null, aisle: null, emoji: null, photo: null });
    expect(res.unpriced.map((l: { name: string }) => l.name)).toEqual(['Foil']);
    expect(res.subtotalCents).toBe(1198 + 585 + 698);
    await api.patch(`/api/items/${milk.id}`).send({ listAmount: 3 });
    expect(by(await get(), 'Milk')).toMatchObject({ amount: 3, lineCents: 1797 });
  });
  it('archived_not_on_list', async () => {
    const { api, a, mk } = await setup();
    const rice = await mk('Rice', a.id, { onList: true, lastPriceCents: 300 });
    await api.patch(`/api/items/${rice.id}`).send({ archived: true });
    const res = (await api.get(`/api/stores/${a.id}/list`)).body;
    expect(res.lines).toEqual([]);
    expect(res.unpriced).toEqual([]);
  });
});

describe('finish with one-offs', () => {
  it('finish_deletes_ticked_oneoffs_and_offlists_staples', async () => {
    const { api, db, a, mk } = await setup();
    const rice = await mk('Rice', a.id, { onList: true, lastPriceCents: 300 });
    const sizeId = rice.sizes[0].id;
    await api.patch(`/api/items/${rice.id}`).send({ listAmount: 4 });
    const o1 = (await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'Candles' })).body;
    const o2 = (await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'Foil' })).body;
    const res = await api.post(`/api/stores/${a.id}/finish`).send({ itemIds: [rice.id], oneOffIds: [o1.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ finished: 2 });
    expect((await api.get(`/api/stores/${a.id}/oneoffs`)).body.map((o: { id: number }) => o.id)).toEqual([o2.id]);
    const row = db.prepare('select on_list, list_amount, list_size_id from items where id = ?').get(rice.id) as { on_list: number; list_amount: number | null; list_size_id: number };
    expect(row).toMatchObject({ on_list: 0, list_amount: null, list_size_id: sizeId });
  });
  it('finish_mixed_rejects_foreign_ids', async () => {
    const { api, a, b, mk } = await setup();
    const rice = await mk('Rice', a.id, { onList: true, lastPriceCents: 300 });
    const mine = (await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'Candles' })).body;
    const theirs = (await api.post(`/api/stores/${b.id}/oneoffs`).send({ name: 'Elsewhere' })).body;
    const res = await api.post(`/api/stores/${a.id}/finish`).send({ itemIds: [rice.id], oneOffIds: [mine.id, theirs.id] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('one-off is not in this store');
    expect((await api.get(`/api/stores/${a.id}/oneoffs`)).body).toHaveLength(1);
    expect((await api.get(`/api/stores/${a.id}/list`)).body.lines.map((l: { name: string }) => l.name)).toEqual(['Rice']);
    expect((await api.post(`/api/stores/${a.id}/finish`).send({ itemIds: [], oneOffIds: 'x' })).status).toBe(400);
    expect((await api.post(`/api/stores/${a.id}/finish`).send({ itemIds: [rice.id] })).body).toEqual({ finished: 1 });
  });
});
