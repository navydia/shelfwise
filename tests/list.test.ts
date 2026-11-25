import { describe, it, expect } from 'vitest';
import { buildList, type ListStaple, type ListOneoff } from '../src/lib/list';

const staple = (o: Partial<ListStaple> & { id: number }): ListStaple => ({
  name: `item${o.id}`, emoji: null, photo: null, categoryId: null, aisle: null, onList: true, archived: false,
  sizeId: o.id * 10, sizeName: '', soldBy: 'each', unitPriceCents: null, amount: 1, ...o,
});
const oneoff = (o: Partial<ListOneoff> & { id: number }): ListOneoff => ({ name: `oneoff${o.id}`, priceCents: null, amount: 1, ...o });

describe('buildList', () => {
  it('includes_only_on_list_items', () => {
    const r = buildList([
      staple({ id: 1, onList: false, unitPriceCents: 100 }),
      staple({ id: 2, unitPriceCents: 100 }),
      staple({ id: 3, unitPriceCents: 100 }),
    ], [], null);
    expect(r.lines.map((l) => l.id)).toEqual([2, 3]);
  });
  it('archived_not_on_list', () => {
    const r = buildList([staple({ id: 1, archived: true, unitPriceCents: 100 }), staple({ id: 2, unitPriceCents: 100 })], [], null);
    expect(r.lines.map((l) => l.id)).toEqual([2]);
  });
  it('subtotal_is_price_times_amount', () => {
    const r = buildList([staple({ id: 1, amount: 2, unitPriceCents: 949 }), staple({ id: 2, unitPriceCents: 399 })], [], null);
    expect(r.subtotalCents).toBe(2297);
    expect(r.lines[0]).toMatchObject({ kind: 'staple', lineCents: 1898, unitPriceCents: 949, amount: 2 });
  });
  it('weight_line_cents_rounds', () => {
    const r = buildList([staple({ id: 1, soldBy: 'weight', amount: 2.35, unitPriceCents: 249 })], [], null);
    expect(r.lines[0].lineCents).toBe(585); // 585.15
    expect(r.subtotalCents).toBe(585);
  });
  it('unpriced_oneoff_in_unpriced', () => {
    const r = buildList([staple({ id: 1, unitPriceCents: 500 })], [oneoff({ id: 7 }), oneoff({ id: 8, priceCents: 250, amount: 2 })], null);
    expect(r.unpriced.map((l) => [l.kind, l.id])).toEqual([['oneoff', 7]]);
    expect(r.unpriced[0]).toMatchObject({ lineCents: null, unitPriceCents: null, categoryId: null, aisle: null, sizeId: null, photo: null });
    expect(r.lines.map((l) => [l.kind, l.id])).toEqual([['staple', 1], ['oneoff', 8]]);
    expect(r.subtotalCents).toBe(1000);
  });
  it('unpriced_items_excluded_from_subtotal_and_listed_separately', () => {
    const r = buildList([staple({ id: 1, unitPriceCents: 500 }), staple({ id: 2 })], [], null);
    expect(r.subtotalCents).toBe(500);
    expect(r.lines.map((l) => l.id)).toEqual([1]);
    expect(r.unpriced.map((l) => l.id)).toEqual([2]);
  });
  it('status_thresholds', () => {
    const at = (cents: number) => buildList([staple({ id: 1, unitPriceCents: cents })], [], 10000).status;
    expect(at(8999)).toBe('under');
    expect(at(9000)).toBe('near');
    expect(at(10000)).toBe('near');
    expect(at(10001)).toBe('over');
  });
  it('zero_or_null_budget_gives_status_none', () => {
    const items = [staple({ id: 1, unitPriceCents: 500 })];
    expect(buildList(items, [], null).status).toBe('none');
    expect(buildList(items, [], 0).status).toBe('none');
  });
});
