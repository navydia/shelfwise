import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { diffSizes, sizeRowText, sizeLabel, parseAmount, ensureDefault, newItemSizes, blankSize, draftFrom } from '../public/lib/staple-sizes.js';

const sz = (id: number, o: any = {}) => ({ id, name: '', soldBy: 'each', lastPriceCents: null, priceSource: null, priceDate: null, usualAmount: 1, isDefault: false, ...o });

describe('staple size drafts', () => {
  it('unchanged_drafts_produce_no_work', () => {
    const orig = [sz(1, { isDefault: true, lastPriceCents: 649 }), sz(2, { name: '4-pack', lastPriceCents: 499 })];
    expect(diffSizes(orig, orig.map(draftFrom))).toEqual({ remove: [], update: [], create: [] });
  });
  it('removed_edited_and_added_sizes', () => {
    const orig = [sz(1, { isDefault: true, lastPriceCents: 649 }), sz(2, { name: '4-pack', lastPriceCents: 499 })];
    const d1 = { ...draftFrom(orig[0]), name: '6-pack', amount: 2 };
    const added = { ...blankSize(), name: 'Tub', price: 579, isDefault: false };
    const d = diffSizes(orig, [d1, added]);
    expect(d.remove).toEqual([2]);
    expect(d.update).toEqual([{ id: 1, patch: { name: '6-pack', usualAmount: 2 } }]);
    expect(d.create).toEqual([{ name: 'Tub', soldBy: 'each', lastPriceCents: 579, usualAmount: 1, isDefault: false }]);
  });
  it('price_change_and_new_default_are_patched', () => {
    const orig = [sz(1, { isDefault: true, lastPriceCents: 649 }), sz(2, { name: 'B', lastPriceCents: 499 })];
    const a = { ...draftFrom(orig[0]), isDefault: false };
    const b = { ...draftFrom(orig[1]), isDefault: true, price: 450 };
    expect(diffSizes(orig, [a, b]).update).toEqual([{ id: 2, patch: { lastPriceCents: 450, isDefault: true } }]);
  });
  it('sold_by_change_without_new_price_leaves_the_cleared_price_to_the_server', () => {
    const orig = [sz(1, { isDefault: true, lastPriceCents: 649 })];
    const noPrice = { ...draftFrom(orig[0]), soldBy: 'weight', price: null };
    expect(diffSizes(orig, [noPrice]).update).toEqual([{ id: 1, patch: { soldBy: 'weight' } }]);
    const sameNumber = { ...draftFrom(orig[0]), soldBy: 'weight', price: 649 };
    expect(diffSizes(orig, [sameNumber]).update).toEqual([{ id: 1, patch: { soldBy: 'weight', lastPriceCents: 649 } }]);
  });
  it('clearing_a_price_sends_null', () => {
    const orig = [sz(1, { isDefault: true, lastPriceCents: 649 })];
    expect(diffSizes(orig, [{ ...draftFrom(orig[0]), price: null }]).update).toEqual([{ id: 1, patch: { lastPriceCents: null } }]);
  });
  it('new_staple_starts_with_one_standard_default_size_and_sends_all_sizes', () => {
    const [first] = [blankSize()];
    expect(first).toMatchObject({ id: null, name: '', soldBy: 'each', price: null, amount: 1, isDefault: true });
    expect(newItemSizes([first])).toEqual([{ name: '', soldBy: 'each', lastPriceCents: null, usualAmount: 1, isDefault: true }]);
  });
  it('ensure_default_promotes_the_first_when_none', () => {
    const out = ensureDefault([{ ...blankSize(), isDefault: false }, { ...blankSize(), name: 'x', isDefault: false }]);
    expect(out.map((s: any) => s.isDefault)).toEqual([true, false]);
    const two = ensureDefault([{ ...blankSize(), isDefault: true }, { ...blankSize(), name: 'x', isDefault: true }]);
    expect(two.filter((s: any) => s.isDefault)).toHaveLength(1);
  });
  it('labels_and_row_text', () => {
    expect(sizeLabel({ name: '' })).toBe('Standard');
    expect(sizeLabel({ name: '6-pack' })).toBe('6-pack');
    expect(sizeRowText({ soldBy: 'each', price: 649, priceSource: 'manual' })).toBe('Each · $6.49 · entered by you');
    expect(sizeRowText({ soldBy: 'each', price: 499, priceSource: 'receipt' })).toBe('Each · $4.99 · from receipt');
    expect(sizeRowText({ soldBy: 'weight', price: 249, priceSource: null })).toBe('By weight · $2.49/lb');
    expect(sizeRowText({ soldBy: 'each', price: null, priceSource: null })).toBe('Each · No price yet');
  });
  it('parse_amount_wants_a_positive_number', () => {
    expect(parseAmount('2')).toBe(2);
    expect(parseAmount(' 1.5 ')).toBe(1.5);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-1')).toBeNull();
  });
});
