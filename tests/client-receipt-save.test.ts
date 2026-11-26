import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { parseWeight, validateDraft, newStapleBody, draftFromLine, willUpdatePrice, planSave, buildMatches, resultSummary } from '../public/lib/receipt-save.js';

const line = (id: number, raw = 'x', priceCents = 100) => ({ id, raw, priceCents });
const itemState = (id: number, itemId: number, sizeId: number, soldBy = 'each', weightText = '') =>
  ({ line: line(id, `line ${id}`), choice: { itemId, sizeId, soldBy }, skipped: false, weightText });
const newState = (id: number, draft: any) => ({ line: line(id, `line ${id}`), choice: { pending: draft }, skipped: false, weightText: '' });

describe('parseWeight', () => {
  it('blank_is_no_weight', () => { expect(parseWeight('')).toEqual({ ok: true, lb: null }); expect(parseWeight('  ')).toEqual({ ok: true, lb: null }); });
  it('positive_numbers', () => { expect(parseWeight('2.5')).toEqual({ ok: true, lb: 2.5 }); expect(parseWeight('3 lb')).toEqual({ ok: true, lb: 3 }); expect(parseWeight('.75')).toEqual({ ok: true, lb: 0.75 }); });
  it('rejects_zero_and_junk', () => { for (const t of ['0', '-1', 'abc', '1.2.3', '2 kg']) expect(parseWeight(t).ok).toBe(false); });
});

describe('new staple draft', () => {
  it('draft_from_line_guesses_name_and_price', () => {
    const d = draftFromLine({ raw: '1ct Oroweat 100% Whole Wheat Bread, 24oz', priceCents: 544 });
    expect(d.name).toMatch(/Oroweat/);
    expect(d).toMatchObject({ sizeName: '', soldBy: 'each', priceText: '5.44' });
  });
  it('validate_needs_a_name', () => { expect(validateDraft({ name: ' ', priceText: '1.00', soldBy: 'each' }, []).ok).toBe(false); });
  it('validate_rejects_taken_names_ignoring_case', () => {
    const r = validateDraft({ name: 'milk', priceText: '', soldBy: 'each' }, ['Milk']);
    expect(r.ok).toBe(false); expect(r.error).toMatch(/already/i);
  });
  it('validate_rejects_bad_price_and_allows_blank', () => {
    expect(validateDraft({ name: 'Tuna', priceText: 'abc', soldBy: 'each' }, []).ok).toBe(false);
    expect(validateDraft({ name: 'Tuna', priceText: '', soldBy: 'each' }, [])).toMatchObject({ ok: true, priceCents: null });
    expect(validateDraft({ name: 'Tuna', priceText: '1.59', soldBy: 'each' }, [])).toMatchObject({ ok: true, priceCents: 159 });
  });
  it('body_has_one_default_size', () => {
    const b = newStapleBody({ name: ' Light tuna ', sizeName: '5 oz can', soldBy: 'each', priceText: '1.59', categoryId: 3 }, 7);
    expect(b).toEqual({ name: 'Light tuna', storeId: 7, categoryId: 3, sizes: [{ name: '5 oz can', soldBy: 'each', lastPriceCents: 159, usualAmount: 1, isDefault: true }] });
  });
  it('body_without_category', () => {
    const b = newStapleBody({ name: 'Tuna', sizeName: '', soldBy: 'weight', priceText: '', categoryId: null }, 1);
    expect(b.categoryId).toBeUndefined();
    expect(b.sizes[0]).toMatchObject({ soldBy: 'weight', lastPriceCents: null });
  });
});

describe('weight and price', () => {
  it('each_always_updates', () => { expect(willUpdatePrice(itemState(1, 1, 1))).toBe(true); });
  it('weight_without_weight_keeps_price', () => {
    expect(willUpdatePrice(itemState(1, 1, 1, 'weight', ''))).toBe(false);
    expect(willUpdatePrice(itemState(1, 1, 1, 'weight', 'oops'))).toBe(false);
  });
  it('weight_with_weight_updates', () => { expect(willUpdatePrice(itemState(1, 1, 1, 'weight', '2.5'))).toBe(true); });
});

describe('planSave', () => {
  it('lists_pending_creates_in_order', () => {
    const a = newState(1, { name: 'A' }); const b = newState(2, { name: 'B' });
    const p = planSave([a, itemState(3, 9, 9), b]);
    expect(p.error).toBeUndefined();
    expect(p.creates.map((s: any) => s.line.id)).toEqual([1, 2]);
  });
  it('blocks_two_lines_on_one_item', () => {
    expect(planSave([itemState(1, 5, 1), itemState(2, 5, 1)]).error).toMatch(/same item/i);
  });
  it('blocks_a_bad_weight', () => { expect(planSave([itemState(1, 5, 1, 'weight', 'zz')]).error).toMatch(/weight/i); });
  it('skipped_and_unmatched_ignored', () => {
    const s = { line: line(1), choice: null, skipped: true, weightText: '' };
    expect(planSave([s, { ...s, skipped: false }]).creates).toEqual([]);
  });
});

describe('buildMatches', () => {
  it('sends_size_and_weight', () => {
    const m = buildMatches([itemState(1, 5, 11), itemState(2, 6, 12, 'weight', '2.5'), itemState(3, 7, 13, 'weight', ''), { line: line(4), choice: null, skipped: false, weightText: '' }]);
    expect(m).toEqual([
      { lineId: 1, itemId: 5, sizeId: 11 },
      { lineId: 2, itemId: 6, sizeId: 12, weightLb: 2.5 },
      { lineId: 3, itemId: 7, sizeId: 13 },
    ]);
  });
});

describe('resultSummary', () => {
  it('splits_updated_and_kept', () => {
    const r = resultSummary([itemState(1, 5, 11), itemState(2, 6, 12, 'weight', ''), itemState(3, 7, 13, 'weight', '1.5')]);
    expect(r.updated).toBe(2);
    expect(r.kept.map((s: any) => s.line.id)).toEqual([2]);
  });
});
