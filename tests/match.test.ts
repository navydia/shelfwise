import { describe, it, expect } from 'vitest';
import { proposeMatches } from '../src/lib/match';

const items = [
  { id: 1, name: 'Bananas' },
  { id: 2, name: 'Olive Oil' },
  { id: 3, name: 'Eggs' },
];
const line = (raw: string, priceCents = 100) => ({ raw, priceCents });

describe('proposeMatches', () => {
  it('alias_match_wins_over_name', () => {
    const r = proposeMatches([line('ORG BNNA 1.29')], items, [{ itemId: 1, label: 'org bnna' }]);
    expect(r[0]).toEqual({ lineIndex: 0, itemId: 1, reason: 'alias' });
  });
  it('name_match_by_prefix_tokens', () => {
    const r = proposeMatches([line('BANANAS 1.29'), line('OLIVE OIL EXTRA VIRGIN 9.49')], items, []);
    expect(r[0]).toMatchObject({ itemId: 1, reason: 'name' });
    expect(r[1]).toMatchObject({ itemId: 2, reason: 'name' });
  });
  it('abbreviation_without_alias_is_unmatched', () => {
    const r = proposeMatches([line('ORG BNNA 1.29')], items, []);
    expect(r[0]).toEqual({ lineIndex: 0, itemId: null, reason: 'none' });
  });
  it('unmatched_line_has_null_item', () => {
    const r = proposeMatches([line('PAPER TOWELS 5.99')], items, []);
    expect(r[0].itemId).toBeNull();
  });
  it('an_item_is_not_matched_twice', () => {
    const r = proposeMatches([line('EGGS 3.99'), line('EGGS LARGE 4.99')], items, []);
    expect(r[0].itemId).toBe(3);
    expect(r[1].itemId).toBeNull();
  });
  it('prefers_the_more_specific_item_name', () => {
    const r = proposeMatches([line('OLIVE OIL 9.49')], [{ id: 5, name: 'Oil' }, { id: 2, name: 'Olive Oil' }], []);
    expect(r[0].itemId).toBe(2);
  });
});
