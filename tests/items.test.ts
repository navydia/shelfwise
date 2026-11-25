import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers/app';

async function setup() {
  const t = makeApp();
  const store = (await t.api.post('/api/stores').send({ name: 'Hannaford', isMain: true })).body;
  return { ...t, store };
}

describe('stores and items API', () => {
  it('creates_store_and_item', async () => {
    const { api, store } = await setup();
    const res = await api.post('/api/items').send({ name: 'Olive oil', storeId: store.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Olive oil', storeId: store.id, usualQty: 1, lastPriceCents: null, onList: false, photo: null, priceSource: null, priceDate: null, categoryId: null, aisle: null });
    expect(res.body.state).toBeUndefined();
    const list = await api.get(`/api/items?storeId=${store.id}`);
    expect(list.body).toHaveLength(1);
    expect((await api.get('/api/stores')).body).toHaveLength(1);
  });
  it('duplicate_item_name_in_store_returns_409', async () => {
    const { api, store } = await setup();
    await api.post('/api/items').send({ name: 'Rice', storeId: store.id });
    const res = await api.post('/api/items').send({ name: ' rice ', storeId: store.id });
    expect(res.status).toBe(409);
  });
  it('blank_name_returns_400', async () => {
    const { api, store } = await setup();
    expect((await api.post('/api/items').send({ name: '   ', storeId: store.id })).status).toBe(400);
  });
  const mkItem = async (extra: object = {}) => {
    const { api, store, db } = await setup();
    const { body } = await api.post('/api/items').send({ name: 'Eggs', storeId: store.id, ...extra });
    return { api, store, db, id: body.id as number };
  };
  it('patch_on_list_true', async () => {
    const { api, id } = await mkItem();
    const res = await api.patch(`/api/items/${id}`).send({ onList: true });
    expect(res.status).toBe(200);
    expect(res.body.onList).toBe(true);
  });
  it('manual_price_sets_source_and_date', async () => {
    const { api, id } = await mkItem();
    const res = await api.patch(`/api/items/${id}`).send({ lastPriceCents: 1199 });
    expect(res.body).toMatchObject({ lastPriceCents: 1199, priceSource: 'manual' });
    expect(Math.abs(Date.now() - Date.parse(res.body.priceDate))).toBeLessThan(5000);
  });
  it('clearing_price_clears_source', async () => {
    const { api, id } = await mkItem();
    await api.patch(`/api/items/${id}`).send({ lastPriceCents: 500 });
    const res = await api.patch(`/api/items/${id}`).send({ lastPriceCents: null });
    expect(res.body).toMatchObject({ lastPriceCents: null, priceSource: null, priceDate: null });
  });
  it('unknown_category_returns_400', async () => {
    const { api, id } = await mkItem();
    expect((await api.patch(`/api/items/${id}`).send({ categoryId: 9999 })).status).toBe(400);
    const ok = await api.patch(`/api/items/${id}`).send({ categoryId: 1 });
    expect(ok.body.categoryId).toBe(1);
    expect((await api.patch(`/api/items/${id}`).send({ categoryId: null })).body.categoryId).toBeNull();
  });
  it('aisle_trimmed_blank_becomes_null_and_too_long_rejected', async () => {
    const { api, id } = await mkItem();
    expect((await api.patch(`/api/items/${id}`).send({ aisle: '  4 ' })).body.aisle).toBe('4');
    expect((await api.patch(`/api/items/${id}`).send({ aisle: '' })).body.aisle).toBeNull();
    expect((await api.patch(`/api/items/${id}`).send({ aisle: 'x'.repeat(21) })).status).toBe(400);
  });
  it('moving_store_clears_aisle', async () => {
    const { api, id } = await mkItem();
    const other = (await api.post('/api/stores').send({ name: 'Deli' })).body;
    await api.patch(`/api/items/${id}`).send({ aisle: '7' });
    expect((await api.patch(`/api/items/${id}`).send({ storeId: other.id })).body.aisle).toBeNull();
    await api.patch(`/api/items/${id}`).send({ aisle: '7' });
    expect((await api.patch(`/api/items/${id}`).send({ storeId: other.id, aisle: '2' })).body.aisle).toBe('2');
  });
  it('changed_at_updates_on_patch', async () => {
    const { api, id } = await mkItem();
    const before = (await api.get('/api/items')).body[0].changedAt as string;
    expect(Number.isNaN(Date.parse(before))).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    const res = await api.patch(`/api/items/${id}`).send({ onList: true });
    expect(res.body.changedAt > before).toBe(true);
  });
  it('only_one_main_store', async () => {
    const { api } = await setup();
    await api.post('/api/stores').send({ name: 'Butcher', isMain: true });
    const stores = (await api.get('/api/stores')).body as { isMain: boolean }[];
    expect(stores.filter((s) => s.isMain)).toHaveLength(1);
  });
  it('delete_item_removes_aliases', async () => {
    const { api, db, store } = await setup();
    const { body } = await api.post('/api/items').send({ name: 'Bananas', storeId: store.id });
    db.prepare("insert into aliases(item_id,label) values (?, 'org bnna')").run(body.id);
    expect((await api.delete(`/api/items/${body.id}`)).status).toBe(204);
    expect(db.prepare('select count(*) c from aliases').get()).toEqual({ c: 0 });
  });
});
