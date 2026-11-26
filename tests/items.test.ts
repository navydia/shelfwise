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
    expect(res.body).toMatchObject({ name: 'Olive oil', storeId: store.id, onList: false, photo: null, emoji: null, archived: false, listSizeId: null, listAmount: null, categoryId: null, aisle: null });
    expect(res.body.state).toBeUndefined();
    for (const k of ['usualQty', 'lastPriceCents', 'priceSource', 'priceDate']) expect(res.body[k]).toBeUndefined();
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
  it('create_item_default_size', async () => {
    const { api, store } = await setup();
    const res = await api.post('/api/items').send({ name: 'Milk', storeId: store.id, lastPriceCents: 349 });
    expect(res.status).toBe(201);
    expect(res.body.sizes).toHaveLength(1);
    expect(res.body.sizes[0]).toMatchObject({ name: '', soldBy: 'each', lastPriceCents: 349, priceSource: 'manual', usualAmount: 1, isDefault: true });
    expect(Math.abs(Date.now() - Date.parse(res.body.sizes[0].priceDate))).toBeLessThan(5000);
    const bare = await api.post('/api/items').send({ name: 'Salt', storeId: store.id });
    expect(bare.body.sizes[0]).toMatchObject({ lastPriceCents: null, priceSource: null, priceDate: null });
  });
  it('create_item_with_sizes', async () => {
    const { api, store } = await setup();
    const res = await api.post('/api/items').send({
      name: 'Cola', storeId: store.id, onList: true,
      sizes: [
        { name: '12-pack', lastPriceCents: 899, usualAmount: 1 },
        { name: 'Loose', soldBy: 'weight', lastPriceCents: 249, usualAmount: 2.5, isDefault: true },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.sizes.map((x: { name: string }) => x.name)).toEqual(['Loose', '12-pack']);
    expect(res.body.sizes[0]).toMatchObject({ soldBy: 'weight', usualAmount: 2.5, isDefault: true });
    expect(res.body.listSizeId).toBe(res.body.sizes[0].id);
    const dup = await api.post('/api/items').send({ name: 'Tea', storeId: store.id, sizes: [{ name: 'A' }, { name: 'a' }] });
    expect(dup.status).toBe(400);
    expect((await api.post('/api/items').send({ name: 'Tea', storeId: store.id, sizes: [] })).status).toBe(400);
  });
  it('patch_list_size_must_belong', async () => {
    const { api, store } = await setup();
    const a = (await api.post('/api/items').send({ name: 'A', storeId: store.id, sizes: [{ name: 'x' }, { name: 'y' }] })).body;
    const b = (await api.post('/api/items').send({ name: 'B', storeId: store.id })).body;
    expect((await api.patch(`/api/items/${a.id}`).send({ listSizeId: b.sizes[0].id })).status).toBe(400);
    const ok = await api.patch(`/api/items/${a.id}`).send({ onList: true, listSizeId: a.sizes[1].id });
    expect(ok.status).toBe(200);
    expect(ok.body.listSizeId).toBe(a.sizes[1].id);
    expect((await api.patch(`/api/items/${a.id}`).send({ listAmount: 0 })).status).toBe(400);
  });
  it('list_amount_resets_on_remove_and_size_change', async () => {
    const { api, store } = await setup();
    const a = (await api.post('/api/items').send({ name: 'A', storeId: store.id, sizes: [{ name: 'x' }, { name: 'y' }] })).body;
    const on = await api.patch(`/api/items/${a.id}`).send({ onList: true, listAmount: 3 });
    expect(on.body.listAmount).toBe(3);
    expect(on.body.listSizeId).toBe(a.sizes[0].id);
    const changed = await api.patch(`/api/items/${a.id}`).send({ listSizeId: a.sizes[1].id });
    expect(changed.body.listAmount).toBeNull();
    await api.patch(`/api/items/${a.id}`).send({ listAmount: 4 });
    const off = await api.patch(`/api/items/${a.id}`).send({ onList: false });
    expect(off.body).toMatchObject({ onList: false, listAmount: null, listSizeId: a.sizes[1].id });
    const again = await api.patch(`/api/items/${a.id}`).send({ onList: true });
    expect(again.body.listSizeId).toBe(a.sizes[1].id);
  });
  it('emoji_length_limit', async () => {
    const { api, store } = await setup();
    const a = (await api.post('/api/items').send({ name: 'A', storeId: store.id })).body;
    expect((await api.patch(`/api/items/${a.id}`).send({ emoji: '🥚' })).body.emoji).toBe('🥚');
    expect((await api.patch(`/api/items/${a.id}`).send({ emoji: '🥚🥚🥚🥚🥚' })).status).toBe(400);
    expect((await api.patch(`/api/items/${a.id}`).send({ emoji: '🥚🥚🥚🥚' })).status).toBe(200);
    expect((await api.patch(`/api/items/${a.id}`).send({ emoji: '' })).body.emoji).toBeNull();
  });
  it('archive_takes_off_list_and_hides', async () => {
    const { api, store } = await setup();
    const a = (await api.post('/api/items').send({ name: 'A', storeId: store.id, onList: true })).body;
    await api.patch(`/api/items/${a.id}`).send({ listAmount: 2 });
    const res = await api.patch(`/api/items/${a.id}`).send({ archived: true });
    expect(res.body).toMatchObject({ archived: true, onList: false, listAmount: null });
    expect((await api.get('/api/items')).body).toHaveLength(0);
    expect((await api.get('/api/items?archived=1')).body.map((i: { id: number }) => i.id)).toEqual([a.id]);
    expect((await api.get(`/api/stores/${store.id}/list`)).body.lines).toHaveLength(0);
    const back = await api.patch(`/api/items/${a.id}`).send({ archived: false });
    expect(back.body.archived).toBe(false);
    expect((await api.get('/api/items')).body).toHaveLength(1);
    expect((await api.get('/api/items?archived=1')).body).toHaveLength(0);
  });
  it('archived_hidden_and_name_conflict_names_it', async () => {
    const { api, store } = await setup();
    const a = (await api.post('/api/items').send({ name: 'Rice', storeId: store.id })).body;
    await api.patch(`/api/items/${a.id}`).send({ archived: true });
    const res = await api.post('/api/items').send({ name: 'rice', storeId: store.id });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'An archived staple is called "Rice"', archivedId: a.id });
    const other = (await api.post('/api/items').send({ name: 'Beans', storeId: store.id })).body;
    const ren = await api.patch(`/api/items/${other.id}`).send({ name: 'RICE' });
    expect(ren.status).toBe(409);
    expect(ren.body.archivedId).toBe(a.id);
    const live = await api.post('/api/items').send({ name: 'Beans', storeId: store.id });
    expect(live.status).toBe(409);
    expect(live.body.archivedId).toBeUndefined();
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
