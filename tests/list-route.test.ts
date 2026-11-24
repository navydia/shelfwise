import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers/app';

async function setup() {
  const t = makeApp();
  const a = (await t.api.post('/api/stores').send({ name: 'Main', isMain: true })).body;
  const b = (await t.api.post('/api/stores').send({ name: 'Deli' })).body;
  const mk = async (name: string, storeId: number, patch: object) => {
    const it = (await t.api.post('/api/items').send({ name, storeId })).body;
    return (await t.api.patch(`/api/items/${it.id}`).send(patch)).body;
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
