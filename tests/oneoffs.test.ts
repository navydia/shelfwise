import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers/app';

async function setup() {
  const t = makeApp();
  const a = (await t.api.post('/api/stores').send({ name: 'Main', isMain: true })).body;
  const b = (await t.api.post('/api/stores').send({ name: 'Deli' })).body;
  return { ...t, a, b };
}

describe('one-offs', () => {
  it('oneoff_crud', async () => {
    const { api, a, b } = await setup();
    const c = await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: '  Birthday candles ', priceCents: 349, amount: 2 });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ name: 'Birthday candles', priceCents: 349, amount: 2, storeId: a.id });
    const bare = (await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'Foil' })).body;
    expect(bare).toMatchObject({ priceCents: null, amount: 1 });
    await api.post(`/api/stores/${b.id}/oneoffs`).send({ name: 'Elsewhere' });
    expect((await api.get(`/api/stores/${a.id}/oneoffs`)).body.map((o: { name: string }) => o.name)).toEqual(['Birthday candles', 'Foil']);

    const p = await api.patch(`/api/oneoffs/${bare.id}`).send({ priceCents: 199, name: 'Foil roll', amount: 3 });
    expect(p.body).toMatchObject({ priceCents: 199, name: 'Foil roll', amount: 3 });
    expect((await api.patch(`/api/oneoffs/${bare.id}`).send({ priceCents: null })).body.priceCents).toBeNull();
    expect((await api.patch(`/api/oneoffs/${bare.id}`).send({ priceCents: 0 })).body.priceCents).toBe(0);

    expect((await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: '  ' })).status).toBe(400);
    expect((await api.post(`/api/stores/${a.id}/oneoffs`).send({})).status).toBe(400);
    expect((await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'x', priceCents: -1 })).status).toBe(400);
    expect((await api.post(`/api/stores/${a.id}/oneoffs`).send({ name: 'x', amount: 0 })).status).toBe(400);
    expect((await api.patch(`/api/oneoffs/${bare.id}`).send({ name: '' })).status).toBe(400);
    expect((await api.patch(`/api/oneoffs/${bare.id}`).send({ amount: -2 })).status).toBe(400);
    expect((await api.post('/api/stores/999/oneoffs').send({ name: 'x' })).status).toBe(404);
    expect((await api.get('/api/stores/999/oneoffs')).status).toBe(404);
    expect((await api.patch('/api/oneoffs/999').send({ name: 'x' })).status).toBe(404);

    expect((await api.delete(`/api/oneoffs/${c.body.id}`)).status).toBe(204);
    expect((await api.delete(`/api/oneoffs/${c.body.id}`)).status).toBe(404);
    expect((await api.get(`/api/stores/${a.id}/oneoffs`)).body).toHaveLength(1);
  });
});
