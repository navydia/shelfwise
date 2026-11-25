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
    expect(res.body[0]).toEqual({ id: expect.any(Number), name: 'Bakery' });
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
