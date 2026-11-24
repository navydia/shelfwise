import { describe, it, expect } from 'vitest';
import { buildList, type ListItem } from '../src/lib/list';

const item = (o: Partial<ListItem> & { id: number }): ListItem => ({
  name: `item${o.id}`, photo: null, state: 'stocked', usualQty: 1, lastPriceCents: null, onList: false, ...o,
});

describe('buildList', () => {
  it('includes_low_out_and_manual_only', () => {
    const r = buildList([
      item({ id: 1, state: 'stocked', lastPriceCents: 100 }),
      item({ id: 2, state: 'low', lastPriceCents: 100 }),
      item({ id: 3, state: 'out', lastPriceCents: 100 }),
      item({ id: 4, state: 'stocked', onList: true, lastPriceCents: 100 }),
    ], null);
    expect(r.lines.map((l) => l.id)).toEqual([2, 3, 4]);
  });
  it('subtotal_is_price_times_qty', () => {
    const r = buildList([
      item({ id: 1, state: 'low', usualQty: 2, lastPriceCents: 949 }),
      item({ id: 2, state: 'out', lastPriceCents: 399 }),
    ], null);
    expect(r.subtotalCents).toBe(2297);
    expect(r.lines[0].lineCents).toBe(1898);
  });
  it('unpriced_items_excluded_from_subtotal_and_listed_separately', () => {
    const r = buildList([
      item({ id: 1, state: 'low', lastPriceCents: 500 }),
      item({ id: 2, state: 'low', lastPriceCents: null }),
    ], null);
    expect(r.subtotalCents).toBe(500);
    expect(r.lines.map((l) => l.id)).toEqual([1]);
    expect(r.unpriced.map((l) => l.id)).toEqual([2]);
  });
  it('status_thresholds', () => {
    const at = (cents: number) =>
      buildList([item({ id: 1, state: 'low', lastPriceCents: cents })], 10000).status;
    expect(at(8999)).toBe('under');
    expect(at(9000)).toBe('near');
    expect(at(10000)).toBe('near');
    expect(at(10001)).toBe('over');
  });
  it('zero_or_null_budget_gives_status_none', () => {
    const items = [item({ id: 1, state: 'low', lastPriceCents: 500 })];
    expect(buildList(items, null).status).toBe('none');
    expect(buildList(items, 0).status).toBe('none');
  });
});
