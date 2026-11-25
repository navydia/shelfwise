import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers/app';

const SEED = ['Produce', 'Dairy & eggs', 'Meat & fish', 'Bakery', 'Pasta & grains', 'Oils & condiments', 'Canned & jarred', 'Baking', 'Snacks', 'Frozen', 'Drinks', 'Household'];

describe('categories API', () => {
  it('lists_seeded_categories_sorted', async () => {
    const { api } = makeApp();
    const res = await api.get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    const names = res.body.map((c: { name: string }) => c.name);
    const sorted = [...SEED].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    expect(names).toEqual(sorted);
    expect(names[0]).toBe('Bakery');
    expect(names[names.length - 1]).toBe('Snacks');
    expect(res.body[0]).toEqual({ id: expect.any(Number), name: 'Bakery', count: 0 });
  });

  it('creates_category', async () => {
    const { api } = makeApp();
    const res = await api.post('/api/categories').send({ name: '  Spices  ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(Number), name: 'Spices' });
    const names = (await api.get('/api/categories')).body.map((c: { name: string }) => c.name);
    expect(names).toContain('Spices');
    expect(names).toHaveLength(13);
  });

  it('duplicate_category_409', async () => {
    const { api } = makeApp();
    const res = await api.post('/api/categories').send({ name: ' produce ' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'category already exists' });
    expect((await api.get('/api/categories')).body).toHaveLength(12);
  });

  it('blank_category_400', async () => {
    const { api } = makeApp();
    const res = await api.post('/api/categories').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'name required' });
    const missing = await api.post('/api/categories').send({});
    expect(missing.status).toBe(400);
  });
});

describe('categories API: management', () => {
  it('rename_category', async () => {
    const { api } = makeApp();
    const c = (await api.post('/api/categories').send({ name: 'Spices' })).body;
    const res = await api.patch(`/api/categories/${c.id}`).send({ name: ' Herbs ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: c.id, name: 'Herbs' });
    expect((await api.patch('/api/categories/9999').send({ name: 'x' })).status).toBe(404);
    expect((await api.patch(`/api/categories/${c.id}`).send({ name: ' ' })).status).toBe(400);
  });
  it('rename_category_duplicate_409', async () => {
    const { api } = makeApp();
    const c = (await api.post('/api/categories').send({ name: 'Spices' })).body;
    expect((await api.patch(`/api/categories/${c.id}`).send({ name: 'produce' })).status).toBe(409);
  });
  it('delete_category_in_use_409', async () => {
    const { api } = makeApp();
    const store = (await api.post('/api/stores').send({ name: 'Main' })).body;
    const c = (await api.post('/api/categories').send({ name: 'Spices' })).body;
    await api.post('/api/items').send({ name: 'Salt', storeId: store.id, categoryId: c.id });
    const res = await api.delete(`/api/categories/${c.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Move its 1 staples first', staples: 1 });
    const empty = (await api.post('/api/categories').send({ name: 'Empty' })).body;
    expect((await api.delete(`/api/categories/${empty.id}`)).status).toBe(204);
    expect((await api.delete(`/api/categories/${empty.id}`)).status).toBe(404);
  });
  it('categories_include_counts', async () => {
    const { api } = makeApp();
    const store = (await api.post('/api/stores').send({ name: 'Main' })).body;
    const c = (await api.post('/api/categories').send({ name: 'Spices' })).body;
    await api.post('/api/items').send({ name: 'Salt', storeId: store.id, categoryId: c.id });
    const gone = (await api.post('/api/items').send({ name: 'Mace', storeId: store.id, categoryId: c.id })).body;
    await api.patch(`/api/items/${gone.id}`).send({ archived: true });
    const row = (await api.get('/api/categories')).body.find((x: { id: number }) => x.id === c.id);
    expect(row).toEqual({ id: c.id, name: 'Spices', count: 1 });
  });
});
