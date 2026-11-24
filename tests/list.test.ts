import { describe, it, expect } from 'vitest';
import { buildList, type ListItem } from '../src/lib/list';

const item = (o: Partial<ListItem> & { id: number }): ListItem => ({
  name: `item${o.id}`, photo: null, usualQty: 1, lastPriceCents: null, onList: false, categoryId: null, aisle: null, ...o,
});

describe('buildList', () => {
  it('includes_only_on_list_items', () => {
    const r = buildList([
      item({ id: 1, lastPriceCents: 100 }),
      item({ id: 2, onList: true, lastPriceCents: 100 }),
      item({ id: 3, onList: true, lastPriceCents: 100 }),
      item({ id: 4, lastPriceCents: 100 }),
    ], null);
    expect(r.lines.map((l) => l.id)).toEqual([2, 3]);
  });
  it('subtotal_is_price_times_qty', () => {
    const r = buildList([
      item({ id: 1, onList: true, usualQty: 2, lastPriceCents: 949 }),
      item({ id: 2, onList: true, lastPriceCents: 399 }),
    ], null);
    expect(r.subtotalCents).toBe(2297);
    expect(r.lines[0].lineCents).toBe(1898);
  });
  it('unpriced_items_excluded_from_subtotal_and_listed_separately', () => {
    const r = buildList([
      item({ id: 1, onList: true, lastPriceCents: 500 }),
      item({ id: 2, onList: true, lastPriceCents: null }),
    ], null);
    expect(r.subtotalCents).toBe(500);
    expect(r.lines.map((l) => l.id)).toEqual([1]);
    expect(r.unpriced.map((l) => l.id)).toEqual([2]);
  });
  it('status_thresholds', () => {
    const at = (cents: number) =>
      buildList([item({ id: 1, onList: true, lastPriceCents: cents })], 10000).status;
    expect(at(8999)).toBe('under');
    expect(at(9000)).toBe('near');
    expect(at(10000)).toBe('near');
    expect(at(10001)).toBe('over');
  });
  it('zero_or_null_budget_gives_status_none', () => {
    const items = [item({ id: 1, onList: true, lastPriceCents: 500 })];
    expect(buildList(items, null).status).toBe('none');
    expect(buildList(items, 0).status).toBe('none');
  });
});
