import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { parsePrice, suggestStaples, findStaple, stepAmount, lineTotalCents, statusFor, finishMessage } from '../public/lib/oneoffs.js';

describe('parsePrice', () => {
  it('blank_means_no_price', () => {
    expect(parsePrice('')).toEqual({ ok: true, cents: null });
    expect(parsePrice('   ')).toEqual({ ok: true, cents: null });
  });
  it('accepts_decimals_with_or_without_dollar_sign', () => {
    expect(parsePrice('3.49')).toEqual({ ok: true, cents: 349 });
    expect(parsePrice('$3.5')).toEqual({ ok: true, cents: 350 });
    expect(parsePrice('4')).toEqual({ ok: true, cents: 400 });
    expect(parsePrice('.99')).toEqual({ ok: true, cents: 99 });
    expect(parsePrice('1,234.50')).toEqual({ ok: true, cents: 123450 });
  });
  it('rejects_junk_and_extra_decimals', () => {
    for (const bad of ['abc', '3.499', '-1', '1,50', '3.', '1e3']) expect(parsePrice(bad).ok).toBe(false);
  });
});

describe('suggestStaples', () => {
  const items = [
    { id: 1, name: 'Eggs', onList: false }, { id: 2, name: 'Egg noodles', onList: false },
    { id: 3, name: 'Veggie burgers', onList: false }, { id: 4, name: 'Eggplant', onList: true }, { id: 5, name: 'Milk', onList: false },
  ];
  it('matches_names_starting_first_then_containing_and_skips_items_already_on_the_list', () => {
    expect(suggestStaples(items, 'egg').map((i: any) => i.id)).toEqual([2, 1, 3]);
    expect(suggestStaples(items, 'EGG', 2).map((i: any) => i.id)).toEqual([2, 1]);
  });
  it('nothing_for_blank', () => {
    expect(suggestStaples(items, '  ')).toEqual([]);
    expect(suggestStaples(items, 'zzz')).toEqual([]);
  });
  it('findStaple_exact_name_ignoring_case', () => {
    expect(findStaple(items, ' eggs ')?.id).toBe(1);
    expect(findStaple(items, 'egg')).toBeUndefined();
    expect(findStaple(items, 'eggplant')?.onList).toBe(true);
  });
});

describe('amounts and totals', () => {
  it('stepAmount_each_by_one_never_below_one_and_weight_by_half_lb', () => {
    expect(stepAmount(1, 'each', 1)).toBe(2);
    expect(stepAmount(1, 'each', -1)).toBe(1);
    expect(stepAmount(3, 'weight', 1)).toBe(3.5);
    expect(stepAmount(0.5, 'weight', -1)).toBe(0.5);
    expect(stepAmount(2.25, 'weight', -1)).toBe(1.75);
  });
  it('lineTotalCents_rounds_and_is_null_without_a_price', () => {
    expect(lineTotalCents(249, 3)).toBe(747);
    expect(lineTotalCents(249, 1.5)).toBe(374);
    expect(lineTotalCents(null, 2)).toBeNull();
  });
  it('statusFor_matches_the_server', () => {
    expect(statusFor(500, null)).toBe('none');
    expect(statusFor(500, 1000)).toBe('under');
    expect(statusFor(900, 1000)).toBe('near');
    expect(statusFor(1001, 1000)).toBe('over');
  });
});

describe('finishMessage', () => {
  it('counts_staples_and_one_offs_apart', () => {
    expect(finishMessage(1, 0)).toBe('Done. 1 item is back in your pantry.');
    expect(finishMessage(2, 0)).toBe('Done. 2 items are back in your pantry.');
    expect(finishMessage(0, 1)).toBe('Done. 1 one-off was removed from the list.');
    expect(finishMessage(2, 3)).toBe('Done. 2 items are back in your pantry and 3 one-offs were removed.');
  });
});
