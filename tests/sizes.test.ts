import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers/app';

async function setup(sizes?: object[]) {
  const t = makeApp();
  const store = (await t.api.post('/api/stores').send({ name: 'Hannaford', isMain: true })).body;
  const item = (await t.api.post('/api/items').send({ name: 'Cola', storeId: store.id, sizes })).body;
  return { ...t, store, item };
}

describe('sizes API', () => {
  it('size_crud_and_default_promotion', async () => {
    const { api, item } = await setup();
    const first = item.sizes[0];
    const added = await api.post(`/api/items/${item.id}/sizes`).send({ name: '6-pack', lastPriceCents: 649, usualAmount: 2 });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ name: '6-pack', soldBy: 'each', lastPriceCents: 649, priceSource: 'manual', usualAmount: 2, isDefault: false });
    expect((await api.post(`/api/items/${item.id}/sizes`).send({ name: '6-PACK' })).status).toBe(409);
    expect((await api.post('/api/items/999/sizes').send({ name: 'x' })).status).toBe(404);

    const made = await api.patch(`/api/sizes/${added.body.id}`).send({ isDefault: true, name: 'Six pack' });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ isDefault: true, name: 'Six pack' });
    const items = (await api.get('/api/items')).body;
    expect(items[0].sizes.map((s: { id: number; isDefault: boolean }) => [s.id, s.isDefault])).toEqual([[added.body.id, true], [first.id, false]]);
    expect((await api.patch(`/api/sizes/${added.body.id}`).send({ isDefault: false })).status).toBe(400);

    expect((await api.delete(`/api/sizes/${added.body.id}`)).status).toBe(204);
    const after = (await api.get('/api/items')).body[0].sizes;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: first.id, isDefault: true });
  });
  it('cannot_delete_last_size_409', async () => {
    const { api, item } = await setup();
    const res = await api.delete(`/api/sizes/${item.sizes[0].id}`);
    expect(res.status).toBe(409);
    expect((await api.get('/api/items')).body[0].sizes).toHaveLength(1);
    expect((await api.delete('/api/sizes/9999')).status).toBe(404);
  });
  it('soldby_change_clears_price', async () => {
    const { api, item } = await setup([{ name: '', lastPriceCents: 500 }]);
    const id = item.sizes[0].id;
    const res = await api.patch(`/api/sizes/${id}`).send({ soldBy: 'weight' });
    expect(res.body).toMatchObject({ soldBy: 'weight', lastPriceCents: null, priceSource: null, priceDate: null });
    await api.patch(`/api/sizes/${id}`).send({ lastPriceCents: 249 });
    const both = await api.patch(`/api/sizes/${id}`).send({ soldBy: 'each', lastPriceCents: 300 });
    expect(both.body).toMatchObject({ soldBy: 'each', lastPriceCents: 300, priceSource: 'manual' });
    const same = await api.patch(`/api/sizes/${id}`).send({ soldBy: 'each' });
    expect(same.body.lastPriceCents).toBe(300);
    expect((await api.patch(`/api/sizes/${id}`).send({ soldBy: 'bulk' })).status).toBe(400);
  });
  it('soldby_change_resets_list_amount', async () => {
    const { api, item } = await setup([{ name: '', lastPriceCents: 500 }]);
    const id = item.sizes[0].id;
    await api.patch(`/api/items/${item.id}`).send({ onList: true, listAmount: 3 });
    await api.patch(`/api/sizes/${id}`).send({ soldBy: 'weight' });
    expect((await api.get('/api/items')).body[0].listAmount).toBeNull();
  });
  it('manual_size_price_sets_source', async () => {
    const { api, item } = await setup();
    const id = item.sizes[0].id;
    const res = await api.patch(`/api/sizes/${id}`).send({ lastPriceCents: 1199 });
    expect(res.body).toMatchObject({ lastPriceCents: 1199, priceSource: 'manual' });
    expect(Math.abs(Date.now() - Date.parse(res.body.priceDate))).toBeLessThan(5000);
    const cleared = await api.patch(`/api/sizes/${id}`).send({ lastPriceCents: null });
    expect(cleared.body).toMatchObject({ lastPriceCents: null, priceSource: null, priceDate: null });
    expect((await api.patch(`/api/sizes/${id}`).send({ lastPriceCents: -1 })).status).toBe(400);
    expect((await api.patch(`/api/sizes/${id}`).send({ usualAmount: 0 })).status).toBe(400);
  });
  it('delete_list_size_moves_list_to_default', async () => {
    const { api, item } = await setup([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    const [a, b, c] = item.sizes as { id: number }[];
    await api.patch(`/api/items/${item.id}`).send({ onList: true, listSizeId: c.id, listAmount: 4 });
    expect((await api.delete(`/api/sizes/${c.id}`)).status).toBe(204);
    expect((await api.get('/api/items')).body[0]).toMatchObject({ listSizeId: a.id, listAmount: null, onList: true });
    // deleting the default that the list uses promotes the next size and the list follows it
    await api.patch(`/api/items/${item.id}`).send({ listAmount: 2 });
    expect((await api.delete(`/api/sizes/${a.id}`)).status).toBe(204);
    const now = (await api.get('/api/items')).body[0];
    expect(now.sizes[0]).toMatchObject({ id: b.id, isDefault: true });
    expect(now).toMatchObject({ listSizeId: b.id, listAmount: null });
  });
});
