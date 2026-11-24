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
    expect(res.body).toMatchObject({ name: 'Olive oil', storeId: store.id, state: 'stocked', usualQty: 1, lastPriceCents: null, onList: false, photo: null });
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
  it('patch_state_to_low', async () => {
    const { api, store } = await setup();
    const { body } = await api.post('/api/items').send({ name: 'Eggs', storeId: store.id });
    const res = await api.patch(`/api/items/${body.id}`).send({ state: 'low' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('low');
  });
  it('patch_invalid_state_returns_400', async () => {
    const { api, store } = await setup();
    const { body } = await api.post('/api/items').send({ name: 'Eggs', storeId: store.id });
    expect((await api.patch(`/api/items/${body.id}`).send({ state: 'empty' })).status).toBe(400);
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
